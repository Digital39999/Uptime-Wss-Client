import LoggerModule from './logger';
import config from '../config';
import WebSocket from 'ws';

export default class UptimeGatewayClient {
	private socket?: WebSocket;
	private lastHeartbeat?: number;
	private reconectInterval?: NodeJS.Timeout;
	private heartbeatInterval?: NodeJS.Timeout;
	private reconnect: {
		tries: number;
		isActive: boolean;
	};

	constructor() {
		this.connect();
		this.reconnect = {
			tries: 0,
			isActive: false,
		};
	}

	/* ----------------------------------- Internal ----------------------------------- */

	public connect() {
		try {
			this.socket = new WebSocket(config.host, {
				headers: {
					'Authorization': config.identify,
				},
			});

			this.loadConnection();
		} catch (e) {
			LoggerModule('Gateway', 'Failed to reconnect to the gateway server.\n', 'red');
			console.error(e);
		}
	}

	private tryReconnect() {
		this.socket?.removeAllListeners();
		this.reconectInterval = setInterval(() => {
			if (this.reconnect.tries > 3) {
				clearInterval(this.reconectInterval);
				return LoggerModule('Gateway', 'Failed to reconnect 3 times, reconnect menually.\n', 'red');
			} else this.reconnect.tries++;

			this.connect();
		}, 30000); // 30 seconds
	}

	private loadConnection() {
		this.loadHeartbeat();

		this.socket?.on('message', (message) => {
			console.log(message);
			const data = JSON.parse(message.toString()) as { connected: boolean; };
			if (data.connected) LoggerModule('Gateway', 'Gateway connection established.', 'green');
			else LoggerModule('Gateway', 'Gateway connection failed.', 'red');
			if (this.reconectInterval) {
				clearInterval(this.reconectInterval);
				this.reconectInterval = undefined;
			}

			this.reconnect.isActive = false;
			this.reconnect.tries = 0;
		});

		this.socket?.on('pong', () => (this.lastHeartbeat = Date.now()));

		this.socket?.on('error', (error) => {
			LoggerModule('Gateway', `An error has occurred while connecting to the gateway server.\n${error}`, 'red');
			if (!this.reconnect.isActive) this.tryReconnect();
		});

		this.socket?.on('close', () => {
			LoggerModule('Gateway', 'Gateway connection closed.\n', 'red');
			if (!this.reconnect.isActive) this.tryReconnect();

			if (this.heartbeatInterval) {
				clearInterval(this.heartbeatInterval);
				this.heartbeatInterval = undefined;
			}
		});
	}

	private loadHeartbeat() {
		this.lastHeartbeat = Date.now();

		this.heartbeatInterval = setInterval(() => {
			this.socket?.ping();

			if (this.lastHeartbeat && Date.now() - this.lastHeartbeat > 90000) this.socket?.close(); // 1 minute 30 seconds
		}, 45000); // 45 seconds
	}
}
