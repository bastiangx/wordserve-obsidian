import { logger } from "./logger";

export interface AutoRespawnConfig {
	enabled: boolean;
	requestThreshold: number;
	timeThresholdMinutes: number;
}

export interface AutoRespawnState {
	requestCount: number;
	lastRespawnTime: number;
}

/** Manages automatic respawning of the backend process based on usage thresholds. */
export class AutoRespawnManager {
	private config: AutoRespawnConfig;
	private state: AutoRespawnState;
	private onRespawnCallback: () => Promise<boolean>;

	constructor(config: AutoRespawnConfig, onRespawnCallback: () => Promise<boolean>) {
		this.config = config;
		this.onRespawnCallback = onRespawnCallback;
		this.state = {
			requestCount: 0,
			lastRespawnTime: Date.now()
		};
	}

	/** Updates configuration settings for auto-respawn behavior. */
	updateConfig(config: AutoRespawnConfig): void {
		this.config = config;
	}

	/** Tracks suggestion requests and triggers respawn if thresholds are met. */
	async onSuggestionRequest(): Promise<void> {
		if (!this.config.enabled) {
			return;
		}

		this.state.requestCount++;
		
		const shouldRespawn = this.shouldRespawn();
		if (shouldRespawn) {
			await this.performRespawn();
		}
	}

	private shouldRespawn(): boolean {
		const requestThresholdReached = this.state.requestCount >= this.config.requestThreshold;
		const timeThresholdReached = this.isTimeThresholdReached();
		
		if (requestThresholdReached) {
			logger.debug(`Auto-respawn triggered: request threshold reached (${this.state.requestCount}/${this.config.requestThreshold})`);
			return true;
		}
		
		if (timeThresholdReached) {
			logger.debug(`Auto-respawn triggered: time threshold reached (${this.getMinutesSinceLastRespawn()}/${this.config.timeThresholdMinutes} minutes)`);
			return true;
		}
		
		return false;
	}

	private isTimeThresholdReached(): boolean {
		const minutesSinceLastRespawn = this.getMinutesSinceLastRespawn();
		return minutesSinceLastRespawn >= this.config.timeThresholdMinutes;
	}

	private getMinutesSinceLastRespawn(): number {
		const millisecondsSinceLastRespawn = Date.now() - this.state.lastRespawnTime;
		return Math.floor(millisecondsSinceLastRespawn / (1000 * 60));
	}

	private async performRespawn(): Promise<void> {
		logger.debug("Auto-respawn: performing respawn");
		
		try {
			const success = await this.onRespawnCallback();
			if (success) {
				this.resetCounters();
				logger.debug("Auto-respawn: completed successfully");
			} else {
				logger.warn("Auto-respawn: failed to respawn");
			}
		} catch (error) {
			logger.error("Auto-respawn: error during respawn:", error);
		}
	}

	private resetCounters(): void {
		this.state.requestCount = 0;
		this.state.lastRespawnTime = Date.now();
	}

	/** Resets request counter and respawn timer. */
	reset(): void {
		this.resetCounters();
	}

	/** Returns current auto-respawn statistics for monitoring. */
	getStats(): { requestCount: number; minutesSinceLastRespawn: number } {
		return {
			requestCount: this.state.requestCount,
			minutesSinceLastRespawn: this.getMinutesSinceLastRespawn()
		};
	}
}
