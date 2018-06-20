import sampleSize from 'lodash.samplesize'
import axios from 'axios'
import createDebug from 'debug';

const debug = createDebug('PeerFinder')

const DEFAULT_BAD_PEER_TIMEOUT_HOURS = 24
const DEFAULT_PEERS_PER_QUERY = 10
const DEFAULT_INTERVAL = 15000
export const DEFAULT_EXCLUDE = ['127.0.0.1', 'localhost', '0.0.0.0', 'local.codius.org', 'codius.example.com']
export const DEFAULT_BOOTSTRAP_PEERS = [
  'https://codius.justmoon.com',
  'https://codius.andros-connector.com',
  'https://codius.africa',
  'https://codius.risky.business',
  'https://codius.feraltc.com',
  'https://codius.tinypolarbear.com'
]

export interface PeerFinderOptions {
  publicUrl?: string,
  bootstrapPeers?: string[],
  excludeHosts?: string[],
  peersPerQuery?: number,
  interval?: number,
  badPeerTimeoutHours?: number
}

export default class PeerFinder {
  private peers: Set<string>
  private excludeHosts: Set<string>
  private badPeers: Map<string, Date> = new Map()
  private peersPerQuery: number
  private interval: number
  private badPeerTimeoutHours: number
  
  constructor (options = {} as PeerFinderOptions) {
    const bootstrapPeers = options.bootstrapPeers || DEFAULT_BOOTSTRAP_PEERS
    let excludeHosts = options.excludeHosts || DEFAULT_EXCLUDE
    this.peersPerQuery = options.peersPerQuery || DEFAULT_PEERS_PER_QUERY
    this.interval = options.interval || DEFAULT_INTERVAL
    this.badPeerTimeoutHours = options.badPeerTimeoutHours || DEFAULT_BAD_PEER_TIMEOUT_HOURS
    if (options.publicUrl) {
      excludeHosts = [new URL(options.publicUrl).hostname, ...excludeHosts]
    }

    this.peers = new Set(bootstrapPeers)
    this.excludeHosts = new Set(excludeHosts)
  }

  start () {
    this.run().catch(err => debug(err))
    setInterval(this.run.bind(this), this.interval)
  }

  async run () {
    debug('Running PeerFinder... current peer list size: %d', this.peers.size)
    for (const peer of sampleSize([...this.peers], this.peersPerQuery)) {
      try {
        const response = await axios.get(`${peer}/peers`)
        this.addPeers(response.data.peers)
      } catch (err) {
        debug('Peer %s errored with "%s". Marking as bad peer...', peer, err.code)
        this.removePeer(peer)
      }
    }
    debug('PeerFinder run finished... new peer list size: %d', this.peers.size)
  }

  getPeers () {
    return [...this.peers]
  }
  
  addPeers (peers: string[]) {
    for (const peer of peers) {
      if (this.addablePeer(peer)) this.peers.add(peer)
    }
  }

  removePeer (peer: string) {
    const expireTime = new Date()
    expireTime.setHours(expireTime.getHours() + this.badPeerTimeoutHours)
    this.badPeers.set(peer, expireTime)
    this.peers.delete(peer)
  }

  private addablePeer(peer: string) {
    const hostname = new URL(peer).hostname
    if (this.excludeHosts.has(hostname)) return false

    const expireTime = this.badPeers.get(peer)
    if (expireTime) {
      if (expireTime > new Date()) {
        return false
      }
      // Bad peer has expired
      this.badPeers.delete(peer)
    }
    return true
  }
  }