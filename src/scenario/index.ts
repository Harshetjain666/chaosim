import type { Scenario } from './types.ts';
import { paymentOutage } from './paymentOutage.ts';
import { ordersValidation } from './ordersValidation.ts';
import { inventoryOutage } from './inventoryOutage.ts';
import { exampleCompany } from '../companyBrain/context.ts';
import { generateAll } from '../companyBrain/generator.ts';

// Hand-authored incidents, plus one incident per service generated from a
// (stand-in) Company Brain context. Each generated Scenario runs through the
// exact same engine as the hand-authored ones, after the validator certifies it.
const handAuthored: Scenario[] = [paymentOutage, ordersValidation, inventoryOutage];
const generated: Scenario[] = generateAll(exampleCompany).map((g) => g.scenario);

export const SCENARIOS: Scenario[] = [...handAuthored, ...generated];
