import { Link } from '@tanstack/react-router';
import { Boxes, Search, ShieldCheck } from 'lucide-react';
import { PageHeader } from '#/components/layout/application-shell';
import {
  CapabilityGap,
  LabeledCard,
  SectionHeading,
} from '#/components/shared/presentation';
import { Button } from '#/components/ui/button';

export function DevicesPage() {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Device projection"
        title="Devices"
        description="Identify the supported feeder and inspect source-aware observations without merging missing data into a false overall state."
      />

      <CapabilityGap
        icon={Boxes}
        title="No management device record is available"
        description="The device registry and runtime observation adapters have not been migrated. The management application cannot yet identify a feeder from AppDaemon, State Agent, or go2rtc data."
      >
        <Button asChild>
          <Link to="/setup">Review setup readiness</Link>
        </Button>
      </CapabilityGap>

      <section aria-labelledby="device-sources-title">
        <SectionHeading
          eyebrow="Projection requirements"
          title="What a device view will verify"
          aside={<span className="section-note">One feeder per add-on</span>}
        />
        <div className="three-column-grid" id="device-sources-title">
          <LabeledCard
            title="Stable identity"
            description="Installer-captured identity and supported product metadata."
          >
            <p className="card-copy">
              Serial and sensitive identifiers remain masked until a durable
              management record owns their presentation.
            </p>
          </LabeledCard>
          <LabeledCard
            title="Source-aware state"
            description="Each observation retains source, age, scope, and validity."
          >
            <p className="card-copy">
              AppDaemon, State Agent, and camera status will remain separate
              when one source is stale or unavailable.
            </p>
          </LabeledCard>
          <LabeledCard
            title="Authority-safe actions"
            description="Persistent writes continue through AppDaemon."
          >
            <p className="card-copy">
              Device pages will submit supported user intent; they will not
              become a second routine feeder writer.
            </p>
          </LabeledCard>
        </div>
      </section>

      <div className="truth-callout">
        <Search aria-hidden="true" />
        <div>
          <strong>Discovery is not device health</strong>
          <p>
            Until a registry adapter exists, an empty list means “not observed,”
            not “no feeder exists.”
          </p>
        </div>
        <ShieldCheck aria-hidden="true" />
      </div>
    </div>
  );
}
