import { Logger } from 'nestjs-pino';

/**
 * Decorator for process methods that logs entry, exit, timing, and errors
 * @param target - The target class
 * @param propertyKey - The method name
 * @param descriptor - The property descriptor
 */
export function ProcessLogger() {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      // Access logger from the instance, not from the descriptor
      const instance = this as any;
      const logger = instance.logger as Logger;

      if (!logger) {
        console.warn(
          'Logger not found in class instance. ProcessLogger may not work correctly.',
        );
        return originalMethod.apply(this, args);
      }

      const jobId = args[0]?.id || 'unknown';
      const jobName = args[0]?.name || 'unknown';
      const processorName = this.constructor.name;

      const startTime = performance.now();
      logger.log(
        `Starting ${processorName}::${propertyKey} - Job: ${jobName} (${jobId})`,
      );

      try {
        if (args[0]?.data) {
          logger.debug(`Job data: ${JSON.stringify(args[0].data, null, 2)}`);
        }

        const result = await originalMethod.apply(this, args);

        const endTime = performance.now();
        const duration = (endTime - startTime).toFixed(2);

        logger.log(
          `Completed ${processorName}::${propertyKey} - Job: ${jobName} (${jobId}) - Duration: ${duration}ms`,
        );

        return result;
      } catch (error: unknown) {
        const endTime = performance.now();
        const duration = (endTime - startTime).toFixed(2);

        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        logger.error(
          `Failed ${processorName}::${propertyKey} - Job: ${jobName} (${jobId}) - Duration: ${duration}ms - Error: ${errorMessage}`,
          errorStack,
        );

        throw error;
      }
    };

    return descriptor;
  };
}
