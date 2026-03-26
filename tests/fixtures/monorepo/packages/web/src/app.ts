import { Logger, Config } from '@myorg/core';

const logger = new Logger();
const config: Config = { env: 'prod', debug: false };

logger.log(`Starting in ${config.env}`);
