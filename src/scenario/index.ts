import type { Scenario } from './types.ts';
import { paymentOutage } from './paymentOutage.ts';
import { ordersValidation } from './ordersValidation.ts';

export const SCENARIOS: Scenario[] = [paymentOutage, ordersValidation];
