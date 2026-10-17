import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';

@Catch(HttpException)
export class CustomExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const status = exception.getStatus();
    response.status(status).json({ success: false, message: errorMessage(exception) });
  }
}

/** Plain text for the apps to show: Nest nests it in an object, and validation errors are a list. */
export function errorMessage(exception: HttpException): string {
  const body = exception.getResponse();
  const msg = typeof body === 'string' ? body : (body as { message?: unknown }).message;
  if (Array.isArray(msg)) return msg.join(', ');
  return typeof msg === 'string' && msg ? msg : exception.message || 'An error occurred';
}
