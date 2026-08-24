import { ArgumentsHost, Catch, ConflictException, ExceptionFilter, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const mapped = this.map(exception);
    const response = host.switchToHttp().getResponse();

    if (!mapped) {
      // Unrecognized Prisma error code — same 500 shape Nest's default filter sends.
      response.status(500).json({ statusCode: 500, message: 'Internal server error' });
      return;
    }

    response.status(mapped.getStatus()).json(mapped.getResponse());
  }

  private map(exception: Prisma.PrismaClientKnownRequestError) {
    switch (exception.code) {
      case 'P2002':
        return new ConflictException('A record with these values already exists');
      case 'P2025':
        return new NotFoundException('Record not found');
      case 'P2003':
        return new ConflictException('This action conflicts with a related record');
      default:
        return null;
    }
  }
}
