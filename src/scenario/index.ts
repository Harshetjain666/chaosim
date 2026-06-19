import type { Scenario } from './types.ts';
import { paymentOutage } from './paymentOutage.ts';
import { ordersValidation } from './ordersValidation.ts';
import { inventoryOutage } from './inventoryOutage.ts';

export const SCENARIOS: Scenario[] = [paymentOutage, ordersValidation, inventoryOutage];
