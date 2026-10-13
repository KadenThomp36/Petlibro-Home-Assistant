import {
  CircleDashed,
  type LucideIcon,
  ShieldCheck,
  Waypoints,
} from 'lucide-react';
import { PageHeader } from '#/components/layout/application-shell';
import { Badge } from '#/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card';

export interface FeatureBoundaryPageProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly icon: LucideIcon;
  readonly owner: string;
  readonly futureInput: string;
  readonly futureOutput: string;
  readonly exclusion: string;
}

export function FeatureBoundaryPage({
  eyebrow,
  title,
  description,
  icon: Icon,
  owner,
  futureInput,
  futureOutput,
  exclusion,
}: FeatureBoundaryPageProps) {
  return (
    <div className="page-stack">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />

      <Card className="boundary-card">
        <CardHeader>
          <div className="boundary-heading">
            <span className="feature-icon" aria-hidden="true">
              <Icon />
            </span>
            <div>
              <Badge variant="outline">Defined boundary</Badge>
              <CardTitle>Planned, not connected</CardTitle>
            </div>
          </div>
          <CardDescription>
            This route establishes navigation and responsibility only. It does
            not display synthetic device data or expose inactive controls.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="boundary-list">
            <div>
              <dt>
                <ShieldCheck aria-hidden="true" /> Owner
              </dt>
              <dd>{owner}</dd>
            </div>
            <div>
              <dt>
                <Waypoints aria-hidden="true" /> Future contract
              </dt>
              <dd>
                <strong>Input:</strong> {futureInput}
                <br />
                <strong>Output:</strong> {futureOutput}
              </dd>
            </div>
            <div>
              <dt>
                <CircleDashed aria-hidden="true" /> Deliberately excluded
              </dt>
              <dd>{exclusion}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
