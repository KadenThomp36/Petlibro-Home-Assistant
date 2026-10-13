#!/usr/bin/env node
'use strict';
// Browser-side receive verification. No screen/video/audio is recorded.
const fs = require('node:fs');
const { chromium } = require('playwright');
const [configFile, reportFile] = process.argv.slice(2);
if (!configFile || !reportFile) {
  console.error('usage: node browser.cjs <private-config.json> <private-result.json>');
  process.exit(2);
}
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
let browser;
let output = { verdict: 'FAIL', reason: 'did not complete', evidence: {} };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function receiveState(page) {
  return await page.evaluate(async () => {
    const pc = (window.__liveTestPeerConnections || []).find(p => p.connectionState === 'connected') ||
               (window.__liveTestPeerConnections || [])[0];
    const video = document.querySelector('video');
    if (!pc || !video) return { peerPresent: !!pc, videoPresent: !!video };
    const stats = await pc.getStats();
    const codecs = {};
    stats.forEach(s => { if (s.type === 'codec') codecs[s.id] = s.mimeType; });
    const inbound = [];
    stats.forEach(s => {
      if (s.type !== 'inbound-rtp' || s.isRemote) return;
      inbound.push({ kind: s.kind || s.mediaType, mimeType: codecs[s.codecId],
        packets: s.packetsReceived || 0, lost: s.packetsLost || 0,
        framesDecoded: s.framesDecoded || 0,
        audioEnergy: s.totalAudioEnergy || 0,
        samplesDuration: s.totalSamplesDuration || 0 });
    });
    return { connection: pc.connectionState,
      video: { readyState: video.readyState, currentTime: video.currentTime || 0,
               width: video.videoWidth || 0, height: video.videoHeight || 0,
               presentedFrames: window.__liveTestPresentedFrames || 0 },
      tracks: pc.getReceivers().map(r => ({ kind: r.track.kind,
        state: r.track.readyState, muted: r.track.muted })), inbound };
  });
}

async function soundEnergy(page) {
  // This is decoded PCM energy from the actual media element, not RTP packets.
  return await page.evaluate(async () => {
    const video = document.querySelector('video');
    let playError = null;
    try { video.muted = false; await video.play(); }
    catch (e) { playError = e.name || 'play_error'; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C || !video.srcObject) return { available: false, playError };
    const ctx = new C();
    let resumeError = null;
    try { await ctx.resume(); }
    catch (e) { resumeError = e.name || 'resume_error'; }
    const active = ctx.state === 'running';
    let peakRms = 0, nonzeroIntervals = 0, samples = 0;
    let source, analyser;
    try {
      if (active) {
        source = ctx.createMediaStreamSource(video.srcObject);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        for (let i = 0; i < 20; i++) {
          await new Promise(resolve => setTimeout(resolve, 100));
          analyser.getFloatTimeDomainData(buf);
          let ss = 0;
          for (const x of buf) ss += x * x;
          const rms = Math.sqrt(ss / buf.length);
          if (rms > 1e-5) nonzeroIntervals++;
          peakRms = Math.max(peakRms, rms);
          samples++;
        }
      }
    } finally {
      if (source) source.disconnect();
      await ctx.close();
    }
    return { available: true, audioContextRunning: active, playError, resumeError,
      peakRms, nonzeroIntervals, samples };
  });
}

async function run() {
  browser = await chromium.launch({ headless: config.headless !== false,
    args: ['--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 900, height: 600 } });
  await context.addInitScript(() => {
    const Native = window.RTCPeerConnection;
    window.__liveTestPeerConnections = [];
    window.__liveTestPresentedFrames = 0;
    function Wrapped(...args) {
      const pc = new Native(...args);
      window.__liveTestPeerConnections.push(pc);
      return pc;
    }
    Wrapped.prototype = Native.prototype;
    Object.setPrototypeOf(Wrapped, Native);
    window.RTCPeerConnection = Wrapped;
    document.addEventListener('DOMContentLoaded', () => {
      const v = document.querySelector('video');
      if (v && typeof v.requestVideoFrameCallback === 'function') {
        const count = () => { window.__liveTestPresentedFrames++;
          v.requestVideoFrameCallback(count); };
        v.requestVideoFrameCallback(count);
      }
    });
  });
  const page = await context.newPage();
  await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => {
    const pcs = window.__liveTestPeerConnections || [];
    const v = document.querySelector('video');
    return pcs.some(p => p.connectionState === 'connected') && v && v.videoWidth > 0 && v.readyState >= 2;
  }, null, { timeout: 40000, polling: 250 });
  const a = await receiveState(page);
  await sleep(5000);
  const b = await receiveState(page);
  const av = a.inbound?.find(x => x.kind === 'video');
  const bv = b.inbound?.find(x => x.kind === 'video');
  const aa = a.inbound?.find(x => x.kind === 'audio');
  const ba = b.inbound?.find(x => x.kind === 'audio');
  const decodedAdvance = (bv?.framesDecoded || 0) - (av?.framesDecoded || 0);
  const displayAdvance = b.video.presentedFrames - a.video.presentedFrames;
  const timeAdvance = b.video.currentTime - a.video.currentTime;
  let evidence = { connection: b.connection, videoWidth: b.video.width, videoHeight: b.video.height,
    decodedAdvance, displayAdvance, playbackTimeAdvance: +timeAdvance.toFixed(3),
    videoCodec: bv?.mimeType, videoPacketsAdvance: (bv?.packets || 0) - (av?.packets || 0),
    videoPacketsLost: bv?.lost || 0 };
  if (!bv || !/video\/H264/i.test(bv.mimeType || '')) {
    output = { verdict: 'FAIL', reason: 'H.264 inbound receiver missing', evidence };
  } else if (decodedAdvance < 50 || displayAdvance < 20 || timeAdvance < 2 || b.video.width < 320) {
    output = { verdict: 'FAIL', reason: 'video did not advance through decode and presentation', evidence };
  } else if (!config.audio) {
    output = { verdict: 'PASS', reason: 'H.264 decoded and visibly presented', evidence };
  } else {
    evidence.audioCodec = ba?.mimeType;
    evidence.audioPacketsAdvance = (ba?.packets || 0) - (aa?.packets || 0);
    evidence.audioEnergyAdvance = (ba?.audioEnergy || 0) - (aa?.audioEnergy || 0);
    evidence.audioSamplesAdvance = (ba?.samplesDuration || 0) - (aa?.samplesDuration || 0);
    if (!ba || !/audio\/opus/i.test(ba.mimeType || '') || evidence.audioPacketsAdvance < 40 || evidence.audioSamplesAdvance < 1) {
      output = { verdict: 'FAIL', reason: 'Opus receiver or decoded audio samples missing', evidence };
    } else {
      const pcm = await soundEnergy(page);
      evidence.pcm = pcm;
      if (pcm.nonzeroIntervals > 0) {
        output = { verdict: 'PASS', reason: 'H.264 presented and Opus decoded to nonzero PCM', evidence };
      } else if (config.stimulus) {
        output = { verdict: 'FAIL', reason: 'expected audible stimulus but decoded PCM remained silent', evidence };
      } else {
        output = { verdict: 'REVIEW', reason: 'Opus decoded; no non-silent PCM and no stimulus declared', evidence };
      }
    }
  }
  await context.close();
}

(async () => {
  try { await run(); }
  catch (e) { output = { verdict: 'FAIL', reason: 'browser error: ' + (e.name || 'Error'), evidence: { message: String(e.message || '').slice(0, 200) } }; }
  finally {
    if (browser) await browser.close().catch(() => {});
    fs.writeFileSync(reportFile, JSON.stringify(output, null, 2));
    process.exitCode = output.verdict === 'FAIL' ? 1 : 0;
  }
})();
