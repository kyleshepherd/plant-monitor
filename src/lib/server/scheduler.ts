import { runEvaluation } from './alerts';
import { sendPushToAll } from './push';

const TWELVE_H = 12 * 3600_000;
const g = globalThis as { __plantScheduler?: ReturnType<typeof setInterval> };

export function startScheduler(): void {
	if (g.__plantScheduler) return;
	const run = () =>
		runEvaluation(sendPushToAll).catch((e) => console.error('[scheduler] evaluation failed', e));
	setTimeout(run, 30_000); // first pass shortly after boot
	g.__plantScheduler = setInterval(run, TWELVE_H);
}
