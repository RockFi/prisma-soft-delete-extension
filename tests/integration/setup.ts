import { generateIntegrationClients, pushIntegrationSchema } from './harness';

export default async function globalSetup() {
  generateIntegrationClients();
  pushIntegrationSchema();
}
