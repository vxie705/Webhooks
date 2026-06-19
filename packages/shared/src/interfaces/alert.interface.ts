export interface IAlertRule {
  name: string;
  metric: string;
  condition: '>' | '<' | '>=' | '<=' | '==';
  threshold: number;
  duration: string;
  severity: 'warning' | 'critical' | 'info';
  description: string;
}