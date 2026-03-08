import { Injectable } from '@nestjs/common';
import { HealthCheckService, HttpHealthIndicator } from '@nestjs/terminus';

@Injectable()
export class HealthService {
  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
  ) {}

  check() {
    return this.health.check([
      () => this.http.pingCheck('google', 'https://google.com', { timeout: 800 }),
    ]);
  }
}
