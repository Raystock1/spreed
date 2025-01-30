/**
 * SPDX-FileCopyrightText: 2025 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {
	CONNECTION_QUALITY,
	PEER_DIRECTION,
	PeerConnectionAnalyzer,
} from './PeerConnectionAnalyzer.js'

/**
 * Helper function to create RTCPeerConnection mocks with just the attributes
 * and methods used by PeerConnectionAnalyzer.
 */
function newRTCPeerConnection() {
	/**
	 * RTCPeerConnectionMock constructor.
	 */
	function RTCPeerConnectionMock() {
		this._listeners = []
		this.iceConnectionState = 'new'
		this.connectionState = 'new'
		this.getStats = jest.fn()
		this.addEventListener = jest.fn((type, listener) => {
			if (type !== 'iceconnectionstatechange' || type !== 'connectionstatechange') {
				return
			}

			if (!Object.prototype.hasOwnProperty.call(this._listeners, type)) {
				this._listeners[type] = [listener]
			} else {
				this._listeners[type].push(listener)
			}
		})
		this.dispatchEvent = (event) => {
			let listeners = this._listeners[event.type]
			if (!listeners) {
				return
			}

			listeners = listeners.slice(0)
			for (let i = 0; i < listeners.length; i++) {
				const listener = listeners[i]
				listener.apply(listener, event)
			}
		}
		this.removeEventListener = jest.fn((type, listener) => {
			if (type !== 'iceconnectionstatechange' || type !== 'connectionstatechange') {
				return
			}

			const listeners = this._listeners[type]
			if (!listeners) {
				return
			}

			const index = listeners.indexOf(listener)
			if (index !== -1) {
				listeners.splice(index, 1)
			}
		})
		this._setIceConnectionState = (iceConnectionState) => {
			this.iceConnectionState = iceConnectionState

			this.dispatchEvent(new Event('iceconnectionstatechange'))
		}
		this._setConnectionState = (connectionState) => {
			this.connectionState = connectionState

			this.dispatchEvent(new Event('connectionstatechange'))
		}
	}
	return new RTCPeerConnectionMock()
}

/**
 * Helper function to create RTCStatsReport mocks with just the attributes and
 * methods used by PeerConnectionAnalyzer.
 *
 * @param {Array} stats the values of the stats
 */
function newRTCStatsReport(stats) {
	/**
	 * RTCStatsReport constructor.
	 */
	function RTCStatsReport() {
		this.values = () => {
			return stats
		}
	}
	return new RTCStatsReport()
}

describe('PeerConnectionAnalyzer', () => {

	let peerConnectionAnalyzer
	let changeConnectionQualityAudioHandler
	let changeConnectionQualityVideoHandler
	let peerConnection

	beforeEach(() => {
		jest.useFakeTimers()

		peerConnectionAnalyzer = new PeerConnectionAnalyzer()

		changeConnectionQualityAudioHandler = jest.fn()
		peerConnectionAnalyzer.on('change:connectionQualityAudio', changeConnectionQualityAudioHandler)

		changeConnectionQualityVideoHandler = jest.fn()
		peerConnectionAnalyzer.on('change:connectionQualityVideo', changeConnectionQualityVideoHandler)

		peerConnection = newRTCPeerConnection()
	})

	afterEach(() => {
		peerConnectionAnalyzer.setPeerConnection(null)

		jest.clearAllMocks()
	})

	describe('analyze sender connection', () => {

		beforeEach(() => {
			peerConnection._setIceConnectionState('connected')
			peerConnection._setConnectionState('connected')
		})

		test.each([
			['good quality', 'audio'],
			['good quality', 'video'],
		])('%s, %s', async (name, kind) => {
			peerConnection.getStats
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 50, timestamp: 10000 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 50, timestamp: 10000, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 100, timestamp: 11000 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 100, timestamp: 11000, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 150, timestamp: 11950 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 150, timestamp: 11950, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 200, timestamp: 13020 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 200, timestamp: 13020, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 250, timestamp: 14010 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 250, timestamp: 14010, packetsLost: 0, roundTripTime: 0.1 },
				]))
				// A sixth report is needed for the initial calculation due to
				// the first stats report being used as the base to calculate
				// relative values of cumulative stats.
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 300, timestamp: 14985 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 300, timestamp: 14985, packetsLost: 0, roundTripTime: 0.1 },
				]))

			peerConnectionAnalyzer.setPeerConnection(peerConnection, PEER_DIRECTION.SENDER)

			jest.advanceTimersByTime(5000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(5)

			expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
			expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(6)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.GOOD)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.GOOD)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.GOOD)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.GOOD)
			}
		})

		test.each([
			['good quality, missing remote packet count', 'audio'],
			['good quality, missing remote packet count', 'video'],
		])('%s, %s', async (name, kind) => {
			peerConnection.getStats
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 50, timestamp: 10000 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 10000, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 100, timestamp: 11000 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 11000, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 150, timestamp: 11950 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 11950, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 200, timestamp: 13020 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 13020, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 250, timestamp: 14010 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 14010, packetsLost: 0, roundTripTime: 0.1 },
				]))
				// A sixth report is needed for the initial calculation due to
				// the first stats report being used as the base to calculate
				// relative values of cumulative stats.
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 300, timestamp: 14985 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 14985, packetsLost: 0, roundTripTime: 0.1 },
				]))

			peerConnectionAnalyzer.setPeerConnection(peerConnection, PEER_DIRECTION.SENDER)

			jest.advanceTimersByTime(5000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(5)

			expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
			expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(6)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.GOOD)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.GOOD)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.GOOD)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.GOOD)
			}
		})

		test.each([
			['medium quality', 'audio'],
			['medium quality', 'video'],
		])('%s, %s', async (name, kind) => {
			peerConnection.getStats
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 50, timestamp: 10000 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 50, timestamp: 10000, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 100, timestamp: 11000 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 95, timestamp: 11000, packetsLost: 5, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 150, timestamp: 11950 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 145, timestamp: 11950, packetsLost: 5, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 200, timestamp: 13020 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 185, timestamp: 13020, packetsLost: 15, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 250, timestamp: 14010 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 230, timestamp: 14010, packetsLost: 20, roundTripTime: 0.1 },
				]))
				// A sixth report is needed for the initial calculation due to
				// the first stats report being used as the base to calculate
				// relative values of cumulative stats.
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 300, timestamp: 14985 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 275, timestamp: 14985, packetsLost: 25, roundTripTime: 0.1 },
				]))

			peerConnectionAnalyzer.setPeerConnection(peerConnection, PEER_DIRECTION.SENDER)

			jest.advanceTimersByTime(5000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(5)

			expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
			expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(6)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.MEDIUM)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.MEDIUM)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.MEDIUM)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.MEDIUM)
			}
		})

		test.each([
			['medium quality, missing remote packet count', 'audio'],
			['medium quality, missing remote packet count', 'video'],
		])('%s, %s', async (name, kind) => {
			peerConnection.getStats
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 50, timestamp: 10000 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 10000, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 100, timestamp: 11000 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 11000, packetsLost: 5, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 150, timestamp: 11950 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 11950, packetsLost: 5, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 200, timestamp: 13020 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 13020, packetsLost: 15, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 250, timestamp: 14010 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 14010, packetsLost: 20, roundTripTime: 0.1 },
				]))
				// A sixth report is needed for the initial calculation due to
				// the first stats report being used as the base to calculate
				// relative values of cumulative stats.
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 300, timestamp: 14985 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 14985, packetsLost: 25, roundTripTime: 0.1 },
				]))

			peerConnectionAnalyzer.setPeerConnection(peerConnection, PEER_DIRECTION.SENDER)

			jest.advanceTimersByTime(5000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(5)

			expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
			expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(6)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.MEDIUM)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.MEDIUM)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.MEDIUM)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.MEDIUM)
			}
		})

		test.each([
			['bad quality', 'audio'],
			['bad quality', 'video'],
		])('%s, %s', async (name, kind) => {
			peerConnection.getStats
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 50, timestamp: 10000 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 50, timestamp: 10000, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 100, timestamp: 11000 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 95, timestamp: 11000, packetsLost: 5, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 150, timestamp: 11950 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 145, timestamp: 11950, packetsLost: 5, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 200, timestamp: 13020 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 185, timestamp: 13020, packetsLost: 15, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 250, timestamp: 14010 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 220, timestamp: 14010, packetsLost: 30, roundTripTime: 0.1 },
				]))
				// A sixth report is needed for the initial calculation due to
				// the first stats report being used as the base to calculate
				// relative values of cumulative stats.
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 300, timestamp: 14985 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 255, timestamp: 14985, packetsLost: 45, roundTripTime: 0.1 },
				]))

			peerConnectionAnalyzer.setPeerConnection(peerConnection, PEER_DIRECTION.SENDER)

			jest.advanceTimersByTime(5000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(5)

			expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
			expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(6)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.BAD)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.BAD)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.BAD)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.BAD)
			}
		})

		test.each([
			['bad quality, missing remote packet count', 'audio'],
			['bad quality, missing remote packet count', 'video'],
		])('%s, %s', async (name, kind) => {
			peerConnection.getStats
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 50, timestamp: 10000 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 10000, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 100, timestamp: 11000 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 11000, packetsLost: 5, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 150, timestamp: 11950 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 11950, packetsLost: 5, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 200, timestamp: 13020 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 13020, packetsLost: 15, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 250, timestamp: 14010 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 14010, packetsLost: 30, roundTripTime: 0.1 },
				]))
				// A sixth report is needed for the initial calculation due to
				// the first stats report being used as the base to calculate
				// relative values of cumulative stats.
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 300, timestamp: 14985 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 14985, packetsLost: 45, roundTripTime: 0.1 },
				]))

			peerConnectionAnalyzer.setPeerConnection(peerConnection, PEER_DIRECTION.SENDER)

			jest.advanceTimersByTime(5000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(5)

			expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
			expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(6)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.BAD)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.BAD)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.BAD)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.BAD)
			}
		})

		test.each([
			['very bad quality', 'audio'],
			['very bad quality', 'video'],
		])('%s, %s', async (name, kind) => {
			peerConnection.getStats
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 50, timestamp: 10000 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 45, timestamp: 10000, packetsLost: 5, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 100, timestamp: 11000 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 90, timestamp: 11000, packetsLost: 10, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 150, timestamp: 11950 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 130, timestamp: 11950, packetsLost: 20, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 200, timestamp: 13020 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 160, timestamp: 13020, packetsLost: 40, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 250, timestamp: 14010 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 190, timestamp: 14010, packetsLost: 60, roundTripTime: 0.1 },
				]))
				// A sixth report is needed for the initial calculation due to
				// the first stats report being used as the base to calculate
				// relative values of cumulative stats.
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 300, timestamp: 14985 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 225, timestamp: 14985, packetsLost: 75, roundTripTime: 0.1 },
				]))

			peerConnectionAnalyzer.setPeerConnection(peerConnection, PEER_DIRECTION.SENDER)

			jest.advanceTimersByTime(5000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(5)

			expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
			expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(6)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.VERY_BAD)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.VERY_BAD)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.VERY_BAD)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.VERY_BAD)
			}
		})

		test.each([
			['very bad quality, missing remote packet count', 'audio'],
			['very bad quality, missing remote packet count', 'video'],
		])('%s, %s', async (name, kind) => {
			peerConnection.getStats
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 50, timestamp: 10000 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 10000, packetsLost: 5, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 100, timestamp: 11000 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 11000, packetsLost: 10, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 150, timestamp: 11950 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 11950, packetsLost: 20, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 200, timestamp: 13020 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 13020, packetsLost: 40, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 250, timestamp: 14010 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 14010, packetsLost: 60, roundTripTime: 0.1 },
				]))
				// A sixth report is needed for the initial calculation due to
				// the first stats report being used as the base to calculate
				// relative values of cumulative stats.
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 300, timestamp: 14985 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 14985, packetsLost: 75, roundTripTime: 0.1 },
				]))

			peerConnectionAnalyzer.setPeerConnection(peerConnection, PEER_DIRECTION.SENDER)

			jest.advanceTimersByTime(5000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(5)

			expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
			expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(6)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.VERY_BAD)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.VERY_BAD)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.VERY_BAD)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.VERY_BAD)
			}
		})

		test.each([
			['very bad quality due to low packets', 'audio'],
			['very bad quality due to low packets', 'video'],
		])('%s, %s', async (name, kind) => {
			peerConnection.getStats
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 5, timestamp: 10000 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 5, timestamp: 10000, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 10, timestamp: 11000 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 10, timestamp: 11000, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 15, timestamp: 11950 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 15, timestamp: 11950, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 20, timestamp: 13020 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 20, timestamp: 13020, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 25, timestamp: 14010 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 25, timestamp: 14010, packetsLost: 0, roundTripTime: 0.1 },
				]))
				// A sixth report is needed for the initial calculation due to
				// the first stats report being used as the base to calculate
				// relative values of cumulative stats.
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 30, timestamp: 14985 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 30, timestamp: 14985, packetsLost: 0, roundTripTime: 0.1 },
				]))

			peerConnectionAnalyzer.setPeerConnection(peerConnection, PEER_DIRECTION.SENDER)

			jest.advanceTimersByTime(5000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(5)

			expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
			expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(6)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.VERY_BAD)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.VERY_BAD)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.VERY_BAD)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.VERY_BAD)
			}
		})

		test.each([
			['very bad quality due to low packets, missing remote packet count', 'audio'],
			['very bad quality due to low packets, missing remote packet count', 'video'],
		])('%s, %s', async (name, kind) => {
			peerConnection.getStats
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 5, timestamp: 10000 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 10000, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 10, timestamp: 11000 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 11000, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 15, timestamp: 11950 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 11950, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 20, timestamp: 13020 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 13020, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 25, timestamp: 14010 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 14010, packetsLost: 0, roundTripTime: 0.1 },
				]))
				// A sixth report is needed for the initial calculation due to
				// the first stats report being used as the base to calculate
				// relative values of cumulative stats.
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 30, timestamp: 14985 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 14985, packetsLost: 0, roundTripTime: 0.1 },
				]))

			peerConnectionAnalyzer.setPeerConnection(peerConnection, PEER_DIRECTION.SENDER)

			jest.advanceTimersByTime(5000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(5)

			expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
			expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(6)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.VERY_BAD)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.VERY_BAD)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.VERY_BAD)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.VERY_BAD)
			}
		})

		test.each([
			['very bad quality due to high round trip time', 'audio'],
			['very bad quality due to high round trip time', 'video'],
		])('%s, %s', async (name, kind) => {
			peerConnection.getStats
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 50, timestamp: 10000 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 50, timestamp: 10000, packetsLost: 0, roundTripTime: 1.5 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 100, timestamp: 11000 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 100, timestamp: 11000, packetsLost: 0, roundTripTime: 1.4 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 150, timestamp: 11950 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 150, timestamp: 11950, packetsLost: 0, roundTripTime: 1.5 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 200, timestamp: 13020 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 200, timestamp: 13020, packetsLost: 0, roundTripTime: 1.6 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 250, timestamp: 14010 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 250, timestamp: 14010, packetsLost: 0, roundTripTime: 1.5 },
				]))
				// A sixth report is needed for the initial calculation due to
				// the first stats report being used as the base to calculate
				// relative values of cumulative stats.
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 300, timestamp: 14985 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 300, timestamp: 14985, packetsLost: 0, roundTripTime: 1.5 },
				]))

			peerConnectionAnalyzer.setPeerConnection(peerConnection, PEER_DIRECTION.SENDER)

			jest.advanceTimersByTime(5000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(5)

			expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
			expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(6)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.VERY_BAD)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.VERY_BAD)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.VERY_BAD)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.VERY_BAD)
			}
		})

		test.each([
			['very bad quality due to high round trip time, missing remote packet count', 'audio'],
			['very bad quality due to high round trip time, missing remote packet count', 'video'],
		])('%s, %s', async (name, kind) => {
			peerConnection.getStats
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 50, timestamp: 10000 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 10000, packetsLost: 0, roundTripTime: 1.5 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 100, timestamp: 11000 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 11000, packetsLost: 0, roundTripTime: 1.4 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 150, timestamp: 11950 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 11950, packetsLost: 0, roundTripTime: 1.5 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 200, timestamp: 13020 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 13020, packetsLost: 0, roundTripTime: 1.6 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 250, timestamp: 14010 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 14010, packetsLost: 0, roundTripTime: 1.5 },
				]))
				// A sixth report is needed for the initial calculation due to
				// the first stats report being used as the base to calculate
				// relative values of cumulative stats.
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 300, timestamp: 14985 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 14985, packetsLost: 0, roundTripTime: 1.5 },
				]))

			peerConnectionAnalyzer.setPeerConnection(peerConnection, PEER_DIRECTION.SENDER)

			jest.advanceTimersByTime(5000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(5)

			expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
			expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(6)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.VERY_BAD)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.VERY_BAD)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.VERY_BAD)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.VERY_BAD)
			}
		})

		test.each([
			['no transmitted data due to full packet loss', 'audio'],
			['no transmitted data due to full packet loss', 'video'],
		])('%s, %s', async (name, kind) => {
			peerConnection.getStats
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 50, timestamp: 10000 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 50, timestamp: 10000, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 100, timestamp: 11000 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 50, timestamp: 11000, packetsLost: 50, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 150, timestamp: 11950 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 50, timestamp: 11950, packetsLost: 100, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 200, timestamp: 13020 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 50, timestamp: 13020, packetsLost: 150, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 250, timestamp: 14010 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 50, timestamp: 14010, packetsLost: 200, roundTripTime: 0.1 },
				]))
				// A sixth report is needed for the initial calculation due to
				// the first stats report being used as the base to calculate
				// relative values of cumulative stats.
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 300, timestamp: 14985 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 50, timestamp: 14985, packetsLost: 250, roundTripTime: 0.1 },
				]))

			peerConnectionAnalyzer.setPeerConnection(peerConnection, PEER_DIRECTION.SENDER)

			jest.advanceTimersByTime(5000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(5)

			expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
			expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(6)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.NO_TRANSMITTED_DATA)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.NO_TRANSMITTED_DATA)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.NO_TRANSMITTED_DATA)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.NO_TRANSMITTED_DATA)
			}
		})

		test.each([
			['no transmitted data due to full packet loss, missing remote packet count', 'audio'],
			['no transmitted data due to full packet loss, missing remote packet count', 'video'],
		])('%s, %s', async (name, kind) => {
			peerConnection.getStats
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 50, timestamp: 10000 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 10000, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 100, timestamp: 11000 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 11000, packetsLost: 50, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 150, timestamp: 11950 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 11950, packetsLost: 100, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 200, timestamp: 13020 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 13020, packetsLost: 150, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 250, timestamp: 14010 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 14010, packetsLost: 200, roundTripTime: 0.1 },
				]))
				// A sixth report is needed for the initial calculation due to
				// the first stats report being used as the base to calculate
				// relative values of cumulative stats.
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 300, timestamp: 14985 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 14985, packetsLost: 250, roundTripTime: 0.1 },
				]))

			peerConnectionAnalyzer.setPeerConnection(peerConnection, PEER_DIRECTION.SENDER)

			jest.advanceTimersByTime(5000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(5)

			expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
			expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(6)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.NO_TRANSMITTED_DATA)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.NO_TRANSMITTED_DATA)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.NO_TRANSMITTED_DATA)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.NO_TRANSMITTED_DATA)
			}
		})

		test.each([
			['no transmitted data due to packets not updated', 'audio'],
			['no transmitted data due to packets not updated', 'video'],
		])('%s, %s', async (name, kind) => {
			peerConnection.getStats
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 50, timestamp: 10000 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 50, timestamp: 10000, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 100, timestamp: 11000 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 100, timestamp: 11000, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 150, timestamp: 11950 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 150, timestamp: 11950, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 150, timestamp: 13020 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 150, timestamp: 13020, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 150, timestamp: 14010 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 150, timestamp: 14010, packetsLost: 0, roundTripTime: 0.1 },
				]))
				// A sixth report is needed for the initial calculation due to
				// the first stats report being used as the base to calculate
				// relative values of cumulative stats.
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 150, timestamp: 14985 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 150, timestamp: 14985, packetsLost: 0, roundTripTime: 0.1 },
				]))
				// When the packets do not increase the analysis is kept on hold
				// until more stat reports are received, as it is not possible
				// to know if the packets were not transmitted or the stats
				// temporarily stalled.
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 150, timestamp: 16010 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 150, timestamp: 16010, packetsLost: 0, roundTripTime: 0.1 },
				]))

			peerConnectionAnalyzer.setPeerConnection(peerConnection, PEER_DIRECTION.SENDER)

			jest.advanceTimersByTime(6000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(6)

			expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
			expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(7)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.NO_TRANSMITTED_DATA)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.NO_TRANSMITTED_DATA)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.NO_TRANSMITTED_DATA)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.NO_TRANSMITTED_DATA)
			}
		})

		test.each([
			['no transmitted data due to packets not updated, missing remote packet count', 'audio'],
			['no transmitted data due to packets not updated, missing remote packet count', 'video'],
		])('%s, %s', async (name, kind) => {
			peerConnection.getStats
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 50, timestamp: 10000 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 10000, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 100, timestamp: 11000 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 11000, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 150, timestamp: 11950 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 11950, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 150, timestamp: 13020 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 13020, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 150, timestamp: 14010 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 14010, packetsLost: 0, roundTripTime: 0.1 },
				]))
				// A sixth report is needed for the initial calculation due to
				// the first stats report being used as the base to calculate
				// relative values of cumulative stats.
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 150, timestamp: 14985 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 14985, packetsLost: 0, roundTripTime: 0.1 },
				]))
				// When the packets do not increase the analysis is kept on hold
				// until more stat reports are received, as it is not possible
				// to know if the packets were not transmitted or the stats
				// temporarily stalled.
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 150, timestamp: 16010 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 16010, packetsLost: 0, roundTripTime: 0.1 },
				]))

			peerConnectionAnalyzer.setPeerConnection(peerConnection, PEER_DIRECTION.SENDER)

			jest.advanceTimersByTime(6000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(6)

			expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
			expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(7)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.NO_TRANSMITTED_DATA)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.NO_TRANSMITTED_DATA)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.NO_TRANSMITTED_DATA)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.NO_TRANSMITTED_DATA)
			}
		})

		test.each([
			['stats stalled for a second', 'audio'],
			['stats stalled for a second', 'video'],
		])('%s, %s', async (name, kind) => {
			peerConnection.getStats
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 50, timestamp: 10000 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 50, timestamp: 10000, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 100, timestamp: 11000 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 100, timestamp: 11000, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 150, timestamp: 11950 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 150, timestamp: 11950, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 200, timestamp: 13020 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 200, timestamp: 13020, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 250, timestamp: 14010 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 250, timestamp: 14010, packetsLost: 0, roundTripTime: 0.1 },
				]))
				// A sixth report is needed for the initial calculation due to
				// the first stats report being used as the base to calculate
				// relative values of cumulative stats.
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 250, timestamp: 14985 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 250, timestamp: 14985, packetsLost: 0, roundTripTime: 0.1 },
				]))
				// When the packets do not increase the analysis is kept on hold
				// until more stat reports are received, as it is not possible
				// to know if the packets were not transmitted or the stats
				// temporarily stalled.
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 350, timestamp: 16010 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 350, timestamp: 16010, packetsLost: 0, roundTripTime: 0.1 },
				]))

			peerConnectionAnalyzer.setPeerConnection(peerConnection, PEER_DIRECTION.SENDER)

			jest.advanceTimersByTime(6000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(6)

			expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
			expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(7)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.GOOD)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.GOOD)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.GOOD)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.GOOD)
			}
		})

		test.each([
			['stats stalled for a second, missing remote packet count', 'audio'],
			['stats stalled for a second, missing remote packet count', 'video'],
		])('%s, %s', async (name, kind) => {
			peerConnection.getStats
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 50, timestamp: 10000 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 10000, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 100, timestamp: 11000 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 11000, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 150, timestamp: 11950 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 11950, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 200, timestamp: 13020 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 13020, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 250, timestamp: 14010 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 14010, packetsLost: 0, roundTripTime: 0.1 },
				]))
				// A sixth report is needed for the initial calculation due to
				// the first stats report being used as the base to calculate
				// relative values of cumulative stats.
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 250, timestamp: 14985 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 14985, packetsLost: 0, roundTripTime: 0.1 },
				]))
				// When the packets do not increase the analysis is kept on hold
				// until more stat reports are received, as it is not possible
				// to know if the packets were not transmitted or the stats
				// temporarily stalled.
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 350, timestamp: 16010 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 16010, packetsLost: 0, roundTripTime: 0.1 },
				]))

			peerConnectionAnalyzer.setPeerConnection(peerConnection, PEER_DIRECTION.SENDER)

			jest.advanceTimersByTime(6000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(6)

			expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
			expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(7)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.GOOD)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.GOOD)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.GOOD)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.GOOD)
			}
		})

		test.each([
			['no transmitted data for two seconds', 'audio'],
			['no transmitted data for two seconds', 'video'],
		])('%s, %s', async (name, kind) => {
			peerConnection.getStats
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 50, timestamp: 10000 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 50, timestamp: 10000, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 100, timestamp: 11000 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 100, timestamp: 11000, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 150, timestamp: 11950 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 150, timestamp: 11950, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 200, timestamp: 13020 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 200, timestamp: 13020, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 250, timestamp: 14010 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 250, timestamp: 14010, packetsLost: 0, roundTripTime: 0.1 },
				]))
				// A sixth report is needed for the initial calculation due to
				// the first stats report being used as the base to calculate
				// relative values of cumulative stats.
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 250, timestamp: 14985 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 250, timestamp: 14985, packetsLost: 0, roundTripTime: 0.1 },
				]))
				// When the packets do not increase the analysis is kept on hold
				// until more stat reports are received, as it is not possible
				// to know if the packets were not transmitted or the stats
				// temporarily stalled. But if the packets are not updated three
				// times in a row it is assumed that the packets were not
				// transmitted.
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 250, timestamp: 16010 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 250, timestamp: 16010, packetsLost: 0, roundTripTime: 0.1 },
				]))

			peerConnectionAnalyzer.setPeerConnection(peerConnection, PEER_DIRECTION.SENDER)

			jest.advanceTimersByTime(6000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(6)

			expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
			expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(7)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.VERY_BAD)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.VERY_BAD)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.VERY_BAD)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.VERY_BAD)
			}
		})

		test.each([
			['no transmitted data for two seconds, missing remote packet count', 'audio'],
			['no transmitted data for two seconds, missing remote packet count', 'video'],
		])('%s, %s', async (name, kind) => {
			peerConnection.getStats
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 50, timestamp: 10000 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 10000, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 100, timestamp: 11000 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 11000, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 150, timestamp: 11950 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 11950, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 200, timestamp: 13020 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 13020, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 250, timestamp: 14010 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 14010, packetsLost: 0, roundTripTime: 0.1 },
				]))
				// A sixth report is needed for the initial calculation due to
				// the first stats report being used as the base to calculate
				// relative values of cumulative stats.
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 250, timestamp: 14985 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 14985, packetsLost: 0, roundTripTime: 0.1 },
				]))
				// When the packets do not increase the analysis is kept on hold
				// until more stat reports are received, as it is not possible
				// to know if the packets were not transmitted or the stats
				// temporarily stalled. But if the packets are not updated three
				// times in a row it is assumed that the packets were not
				// transmitted.
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 250, timestamp: 16010 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 16010, packetsLost: 0, roundTripTime: 0.1 },
				]))

			peerConnectionAnalyzer.setPeerConnection(peerConnection, PEER_DIRECTION.SENDER)

			jest.advanceTimersByTime(6000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(6)

			expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
			expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(7)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.VERY_BAD)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.VERY_BAD)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.VERY_BAD)
				expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(1)
				expect(changeConnectionQualityVideoHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.VERY_BAD)
			}
		})

		test.each([
			['good quality degrading to very bad', 'audio'],
			['good quality degrading to very bad', 'video'],
		])('%s, %s', async (name, kind) => {
			peerConnection.getStats
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 50, timestamp: 10000 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 50, timestamp: 10000, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 100, timestamp: 11000 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 100, timestamp: 11000, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 150, timestamp: 11950 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 150, timestamp: 11950, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 200, timestamp: 13020 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 200, timestamp: 13020, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 250, timestamp: 14010 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 250, timestamp: 14010, packetsLost: 0, roundTripTime: 0.1 },
				]))
				// A sixth report is needed for the initial calculation due to
				// the first stats report being used as the base to calculate
				// relative values of cumulative stats.
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 300, timestamp: 14985 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 300, timestamp: 14985, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 350, timestamp: 16010 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 340, timestamp: 16010, packetsLost: 10, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 400, timestamp: 17000 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 380, timestamp: 17000, packetsLost: 20, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 450, timestamp: 17990 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 410, timestamp: 17990, packetsLost: 40, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 500, timestamp: 19005 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 435, timestamp: 19005, packetsLost: 65, roundTripTime: 0.1 },
				]))

			peerConnectionAnalyzer.setPeerConnection(peerConnection, PEER_DIRECTION.SENDER)

			jest.advanceTimersByTime(5000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(5)

			expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
			expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(6)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.GOOD)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.GOOD)
			}

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(7)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.GOOD)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.GOOD)
			}

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(8)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.MEDIUM)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.MEDIUM)
			}

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(9)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.BAD)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.BAD)
			}

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(10)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.VERY_BAD)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.VERY_BAD)
			}
		})

		test.each([
			['good quality degrading to very bad, missing remote packet count', 'audio'],
			['good quality degrading to very bad, missing remote packet count', 'video'],
		])('%s, %s', async (name, kind) => {
			peerConnection.getStats
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 50, timestamp: 10000 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 10000, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 100, timestamp: 11000 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 11000, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 150, timestamp: 11950 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 11950, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 200, timestamp: 13020 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 13020, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 250, timestamp: 14010 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 14010, packetsLost: 0, roundTripTime: 0.1 },
				]))
				// A sixth report is needed for the initial calculation due to
				// the first stats report being used as the base to calculate
				// relative values of cumulative stats.
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 300, timestamp: 14985 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 14985, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 350, timestamp: 16010 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 16010, packetsLost: 10, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 400, timestamp: 17000 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 17000, packetsLost: 20, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 450, timestamp: 17990 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 17990, packetsLost: 40, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 500, timestamp: 19005 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 19005, packetsLost: 65, roundTripTime: 0.1 },
				]))

			peerConnectionAnalyzer.setPeerConnection(peerConnection, PEER_DIRECTION.SENDER)

			jest.advanceTimersByTime(5000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(5)

			expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
			expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(6)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.GOOD)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.GOOD)
			}

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(7)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.GOOD)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.GOOD)
			}

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(8)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.MEDIUM)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.MEDIUM)
			}

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(9)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.BAD)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.BAD)
			}

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(10)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.VERY_BAD)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.VERY_BAD)
			}
		})

		test.each([
			['very bad quality improving to good', 'audio'],
			['very bad quality improving to good', 'video'],
		])('%s, %s', async (name, kind) => {
			peerConnection.getStats
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 50, timestamp: 10000 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 45, timestamp: 10000, packetsLost: 5, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 100, timestamp: 11000 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 90, timestamp: 11000, packetsLost: 10, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 150, timestamp: 11950 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 130, timestamp: 11950, packetsLost: 20, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 200, timestamp: 13020 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 160, timestamp: 13020, packetsLost: 40, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 250, timestamp: 14010 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 190, timestamp: 14010, packetsLost: 60, roundTripTime: 0.1 },
				]))
				// A sixth report is needed for the initial calculation due to
				// the first stats report being used as the base to calculate
				// relative values of cumulative stats.
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 300, timestamp: 14985 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 225, timestamp: 14985, packetsLost: 75, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 350, timestamp: 16010 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 260, timestamp: 16010, packetsLost: 90, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 400, timestamp: 17000 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 305, timestamp: 17000, packetsLost: 95, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 450, timestamp: 17990 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 355, timestamp: 17990, packetsLost: 95, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 500, timestamp: 19005 },
					{ type: 'remote-inbound-rtp', kind, packetsReceived: 405, timestamp: 19005, packetsLost: 95, roundTripTime: 0.1 },
				]))

			peerConnectionAnalyzer.setPeerConnection(peerConnection, PEER_DIRECTION.SENDER)

			jest.advanceTimersByTime(5000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(5)

			expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
			expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(6)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.VERY_BAD)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.VERY_BAD)
			}

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(7)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.VERY_BAD)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.VERY_BAD)
			}

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(8)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.BAD)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.BAD)
			}

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(9)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.MEDIUM)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.MEDIUM)
			}

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(10)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.GOOD)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.GOOD)
			}
		})

		test.each([
			['very bad quality improving to good, missing remote packet count', 'audio'],
			['very bad quality improving to good, missing remote packet count', 'video'],
		])('%s, %s', async (name, kind) => {
			peerConnection.getStats
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 50, timestamp: 10000 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 10000, packetsLost: 5, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 100, timestamp: 11000 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 11000, packetsLost: 10, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 150, timestamp: 11950 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 11950, packetsLost: 20, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 200, timestamp: 13020 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 13020, packetsLost: 40, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 250, timestamp: 14010 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 14010, packetsLost: 60, roundTripTime: 0.1 },
				]))
				// A sixth report is needed for the initial calculation due to
				// the first stats report being used as the base to calculate
				// relative values of cumulative stats.
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 300, timestamp: 14985 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 14985, packetsLost: 75, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 350, timestamp: 16010 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 16010, packetsLost: 90, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 400, timestamp: 17000 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 17000, packetsLost: 95, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 450, timestamp: 17990 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 17990, packetsLost: 95, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind, packetsSent: 500, timestamp: 19005 },
					{ type: 'remote-inbound-rtp', kind, timestamp: 19005, packetsLost: 95, roundTripTime: 0.1 },
				]))

			peerConnectionAnalyzer.setPeerConnection(peerConnection, PEER_DIRECTION.SENDER)

			jest.advanceTimersByTime(5000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(5)

			expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
			expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(6)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.VERY_BAD)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.VERY_BAD)
			}

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(7)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.VERY_BAD)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.VERY_BAD)
			}

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(8)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.BAD)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.BAD)
			}

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(9)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.MEDIUM)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.MEDIUM)
			}

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(10)

			if (kind === 'audio') {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.GOOD)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			} else {
				expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
				expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.GOOD)
			}
		})

		test('good audio quality, very bad video quality', async () => {
			peerConnection.getStats
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind: 'audio', packetsSent: 50, timestamp: 10000 },
					{ type: 'remote-inbound-rtp', kind: 'audio', packetsReceived: 50, timestamp: 10000, packetsLost: 0, roundTripTime: 0.1 },
					{ type: 'outbound-rtp', kind: 'video', packetsSent: 50, timestamp: 10000 },
					{ type: 'remote-inbound-rtp', kind: 'video', packetsReceived: 45, timestamp: 10000, packetsLost: 5, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind: 'audio', packetsSent: 100, timestamp: 11000 },
					{ type: 'remote-inbound-rtp', kind: 'audio', packetsReceived: 100, timestamp: 11000, packetsLost: 0, roundTripTime: 0.1 },
					{ type: 'outbound-rtp', kind: 'video', packetsSent: 100, timestamp: 11000 },
					{ type: 'remote-inbound-rtp', kind: 'video', packetsReceived: 90, timestamp: 11000, packetsLost: 10, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind: 'audio', packetsSent: 150, timestamp: 11950 },
					{ type: 'remote-inbound-rtp', kind: 'audio', packetsReceived: 150, timestamp: 11950, packetsLost: 0, roundTripTime: 0.1 },
					{ type: 'outbound-rtp', kind: 'video', packetsSent: 150, timestamp: 11950 },
					{ type: 'remote-inbound-rtp', kind: 'video', packetsReceived: 130, timestamp: 11950, packetsLost: 20, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind: 'audio', packetsSent: 200, timestamp: 13020 },
					{ type: 'remote-inbound-rtp', kind: 'audio', packetsReceived: 200, timestamp: 13020, packetsLost: 0, roundTripTime: 0.1 },
					{ type: 'outbound-rtp', kind: 'video', packetsSent: 200, timestamp: 13020 },
					{ type: 'remote-inbound-rtp', kind: 'video', packetsReceived: 160, timestamp: 13020, packetsLost: 40, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind: 'audio', packetsSent: 250, timestamp: 14010 },
					{ type: 'remote-inbound-rtp', kind: 'audio', packetsReceived: 250, timestamp: 14010, packetsLost: 0, roundTripTime: 0.1 },
					{ type: 'outbound-rtp', kind: 'video', packetsSent: 250, timestamp: 14010 },
					{ type: 'remote-inbound-rtp', kind: 'video', packetsReceived: 190, timestamp: 14010, packetsLost: 60, roundTripTime: 0.1 },
				]))
				// A sixth report is needed for the initial calculation due to
				// the first stats report being used as the base to calculate
				// relative values of cumulative stats.
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind: 'audio', packetsSent: 300, timestamp: 14985 },
					{ type: 'remote-inbound-rtp', kind: 'audio', packetsReceived: 300, timestamp: 14985, packetsLost: 0, roundTripTime: 0.1 },
					{ type: 'outbound-rtp', kind: 'video', packetsSent: 300, timestamp: 14985 },
					{ type: 'remote-inbound-rtp', kind: 'video', packetsReceived: 225, timestamp: 14985, packetsLost: 75, roundTripTime: 0.1 },
				]))

			peerConnectionAnalyzer.setPeerConnection(peerConnection, PEER_DIRECTION.SENDER)

			jest.advanceTimersByTime(5000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(5)

			expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
			expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(6)

			expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.GOOD)
			expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.VERY_BAD)
			expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(1)
			expect(changeConnectionQualityAudioHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.GOOD)
			expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(1)
			expect(changeConnectionQualityVideoHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.VERY_BAD)
		})

		test('very bad audio quality, good video quality', async () => {
			peerConnection.getStats
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind: 'audio', packetsSent: 50, timestamp: 10000 },
					{ type: 'remote-inbound-rtp', kind: 'audio', packetsReceived: 45, timestamp: 10000, packetsLost: 5, roundTripTime: 0.1 },
					{ type: 'outbound-rtp', kind: 'video', packetsSent: 50, timestamp: 10000 },
					{ type: 'remote-inbound-rtp', kind: 'video', packetsReceived: 50, timestamp: 10000, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind: 'audio', packetsSent: 100, timestamp: 11000 },
					{ type: 'remote-inbound-rtp', kind: 'audio', packetsReceived: 90, timestamp: 11000, packetsLost: 10, roundTripTime: 0.1 },
					{ type: 'outbound-rtp', kind: 'video', packetsSent: 100, timestamp: 11000 },
					{ type: 'remote-inbound-rtp', kind: 'video', packetsReceived: 100, timestamp: 11000, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind: 'audio', packetsSent: 150, timestamp: 11950 },
					{ type: 'remote-inbound-rtp', kind: 'audio', packetsReceived: 130, timestamp: 11950, packetsLost: 20, roundTripTime: 0.1 },
					{ type: 'outbound-rtp', kind: 'video', packetsSent: 150, timestamp: 11950 },
					{ type: 'remote-inbound-rtp', kind: 'video', packetsReceived: 150, timestamp: 11950, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind: 'audio', packetsSent: 200, timestamp: 13020 },
					{ type: 'remote-inbound-rtp', kind: 'audio', packetsReceived: 160, timestamp: 13020, packetsLost: 40, roundTripTime: 0.1 },
					{ type: 'outbound-rtp', kind: 'video', packetsSent: 200, timestamp: 13020 },
					{ type: 'remote-inbound-rtp', kind: 'video', packetsReceived: 200, timestamp: 13020, packetsLost: 0, roundTripTime: 0.1 },
				]))
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind: 'audio', packetsSent: 250, timestamp: 14010 },
					{ type: 'remote-inbound-rtp', kind: 'audio', packetsReceived: 190, timestamp: 14010, packetsLost: 60, roundTripTime: 0.1 },
					{ type: 'outbound-rtp', kind: 'video', packetsSent: 250, timestamp: 14010 },
					{ type: 'remote-inbound-rtp', kind: 'video', packetsReceived: 250, timestamp: 14010, packetsLost: 0, roundTripTime: 0.1 },
				]))
				// A sixth report is needed for the initial calculation due to
				// the first stats report being used as the base to calculate
				// relative values of cumulative stats.
				.mockResolvedValueOnce(newRTCStatsReport([
					{ type: 'outbound-rtp', kind: 'audio', packetsSent: 300, timestamp: 14985 },
					{ type: 'remote-inbound-rtp', kind: 'audio', packetsReceived: 225, timestamp: 14985, packetsLost: 75, roundTripTime: 0.1 },
					{ type: 'outbound-rtp', kind: 'video', packetsSent: 300, timestamp: 14985 },
					{ type: 'remote-inbound-rtp', kind: 'video', packetsReceived: 300, timestamp: 14985, packetsLost: 0, roundTripTime: 0.1 },
				]))

			peerConnectionAnalyzer.setPeerConnection(peerConnection, PEER_DIRECTION.SENDER)

			jest.advanceTimersByTime(5000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(5)

			expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.UNKNOWN)
			expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(0)
			expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(0)

			jest.advanceTimersByTime(1000)
			// Force the promises returning the stats to be executed.
			await null

			expect(peerConnection.getStats).toHaveBeenCalledTimes(6)

			expect(peerConnectionAnalyzer.getConnectionQualityAudio()).toBe(CONNECTION_QUALITY.VERY_BAD)
			expect(peerConnectionAnalyzer.getConnectionQualityVideo()).toBe(CONNECTION_QUALITY.GOOD)
			expect(changeConnectionQualityAudioHandler).toHaveBeenCalledTimes(1)
			expect(changeConnectionQualityAudioHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.VERY_BAD)
			expect(changeConnectionQualityVideoHandler).toHaveBeenCalledTimes(1)
			expect(changeConnectionQualityVideoHandler).toHaveBeenCalledWith(peerConnectionAnalyzer, CONNECTION_QUALITY.GOOD)
		})
	})
})
