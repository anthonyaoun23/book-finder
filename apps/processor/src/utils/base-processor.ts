import { WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { Job } from 'bullmq';

@Injectable()
export abstract class BaseProcessor extends WorkerHost {
  @Inject(Logger)
  protected readonly logger: Logger;

  abstract process(job: Job): Promise<any>;

  /**
   * Logs a message with the processor's name prefixed
   * @param message The message to log
   * @param context Optional context information
   */
  protected log(message: string, context?: Record<string, any>): void {
    const processorName = this.constructor.name;
    this.logger.log(`[${processorName}] ${message}`, context);
  }

  /**
   * Logs an error with the processor's name prefixed
   * @param message Error message
   * @param trace Optional stack trace
   * @param context Optional context information
   */
  protected error(
    message: string,
    trace?: string,
    context?: Record<string, any>,
  ): void {
    const processorName = this.constructor.name;
    this.logger.error(`[${processorName}] ${message}`, trace, context);
  }

  /**
   * Logs a warning with the processor's name prefixed
   * @param message Warning message
   * @param context Optional context information
   */
  protected warn(message: string, context?: Record<string, any>): void {
    const processorName = this.constructor.name;
    this.logger.warn(`[${processorName}] ${message}`, context);
  }

  /**
   * Logs debug information with the processor's name prefixed
   * @param message Debug message
   * @param context Optional context information
   */
  protected debug(message: string, context?: Record<string, any>): void {
    const processorName = this.constructor.name;
    this.logger.debug(`[${processorName}] ${message}`, context);
  }
}
