import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    // Si el error viene con metadata (como service)
    const serviceName = exception?.response?.service;

    const isConnectionRefused =
      exception?.code === 'ECONNREFUSED' ||
      exception?.message?.includes('ECONNREFUSED') ||
      exception?.message?.includes('timeout') ||
      exception?.name === 'AggregateError';

    if (isConnectionRefused) {
      const service = serviceName ?? 'unknown-service';

      this.logger.error(
        `Microservice ${service} unavailable: ${exception.message}`,
      );

      return response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        status: 'down',
        service,
        message: 'Microservice unavailable',
        error: exception.message,
      });
    }

    // HttpException normal
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();

      const service = res['service'] ?? 'unknown-service';

      this.logger.error(
        `HttpException in ${service}: ${JSON.stringify(res)}`
      );

      return response.status(status).json(res);
    }

    // Error inesperado
    this.logger.error(
      `Unhandled exception: ${exception.message}`,
      exception.stack,
    );

    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      status: 'error',
      message: 'Internal server error',
      error: exception.message,
    });
  }
}
