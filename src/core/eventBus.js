/**
 * @file eventBus.js
 * @description Zero-dependency Pub/Sub event mediator supporting wildcard or typed
 * subscriptions, priority sorting, unsubscriber functions, and error boundary isolation.
 * Completely decoupled from DOM and Web Audio APIs.
 */

export class EventBus {
  /**
   * @param {Object} [options={}]
   * @param {(error: Error, event: string, payload: any) => void} [options.errorHandler]
   */
  constructor(options = {}) {
    /** @type {Map<string, Array<{ id: number, callback: Function, once: boolean, priority: number }>>} */
    this._listeners = new Map();
    this._errorHandler = options.errorHandler || ((err, event) => {
      // In production or test environments, default to console.error
      if (typeof console !== 'undefined' && console.error) {
        console.error(`[EventBus] Error in subscriber for "${event}":`, err);
      }
    });
    this._nextId = 1;
  }

  /**
   * Subscribe to a specific event or wildcard ('*')
   * @param {string} event - Event name or '*'
   * @param {Function} callback - (payload: any, eventName: string) => void
   * @param {Object} [options={}]
   * @param {boolean} [options.once=false] - Auto-unsubscribe after first execution
   * @param {number} [options.priority=0] - Higher priority callbacks fire earlier
   * @returns {() => void} Unsubscribe function
   */
  subscribe(event, callback, options = {}) {
    if (typeof event !== 'string' || !event) {
      throw new TypeError('[EventBus] Event name must be a non-empty string');
    }
    if (typeof callback !== 'function') {
      throw new TypeError('[EventBus] Callback must be a function');
    }

    const entry = {
      id: this._nextId++,
      callback,
      once: Boolean(options.once),
      priority: typeof options.priority === 'number' ? options.priority : 0
    };

    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    const list = this._listeners.get(event);
    list.push(entry);
    list.sort((a, b) => b.priority - a.priority);

    return () => {
      this.unsubscribe(event, callback);
    };
  }

  /**
   * Alias for subscribe
   */
  on(event, callback, options) {
    return this.subscribe(event, callback, options);
  }

  /**
   * Subscribe to an event for exactly one invocation
   * @param {string} event
   * @param {Function} callback
   * @param {Object} [options={}]
   * @returns {() => void} Unsubscribe function
   */
  subscribeOnce(event, callback, options = {}) {
    return this.subscribe(event, callback, { ...options, once: true });
  }

  /**
   * Alias for subscribeOnce
   */
  once(event, callback, options) {
    return this.subscribeOnce(event, callback, options);
  }

  /**
   * Unsubscribe a specific callback from an event
   * @param {string} event
   * @param {Function} callback
   * @returns {boolean} True if a listener was removed
   */
  unsubscribe(event, callback) {
    if (!this._listeners.has(event)) return false;
    const list = this._listeners.get(event);
    const initialLen = list.length;
    const filtered = list.filter(item => item.callback !== callback);
    if (filtered.length === 0) {
      this._listeners.delete(event);
    } else {
      this._listeners.set(event, filtered);
    }
    return filtered.length < initialLen;
  }

  /**
   * Alias for unsubscribe
   */
  off(event, callback) {
    return this.unsubscribe(event, callback);
  }

  /**
   * Publish an event to registered listeners with error isolation and re-entrancy safety
   * @param {string} event
   * @param {any} [payload]
   * @returns {{ event: string, deliveredCount: number, errors: Error[] }}
   */
  publish(event, payload) {
    if (typeof event !== 'string' || !event) {
      throw new TypeError('[EventBus] Event name must be a non-empty string');
    }

    let deliveredCount = 0;
    const errors = [];

    // Snapshot direct and wildcard listeners to protect against mid-dispatch mutation
    const directListeners = this._listeners.has(event) ? [...this._listeners.get(event)] : [];
    const wildcardListeners = (event !== '*' && this._listeners.has('*')) ? [...this._listeners.get('*')] : [];

    // Merge and maintain priority ordering
    const combined = [...directListeners, ...wildcardListeners].sort((a, b) => b.priority - a.priority);

    for (const entry of combined) {
      // Remove once listeners immediately from internal registration
      if (entry.once) {
        if (directListeners.includes(entry)) {
          this._removeEntry(event, entry.id);
        } else {
          this._removeEntry('*', entry.id);
        }
      }

      // Execute with error boundary protection
      try {
        entry.callback(payload, event);
        deliveredCount++;
      } catch (err) {
        errors.push(err);
        try {
          this._errorHandler(err, event, payload);
        } catch (handlerErr) {
          if (typeof console !== 'undefined' && console.error) {
            console.error('[EventBus] Critical error in custom errorHandler:', handlerErr);
          }
        }
      }
    }

    return {
      event,
      deliveredCount,
      errors
    };
  }

  /**
   * Alias for publish
   */
  emit(event, payload) {
    return this.publish(event, payload);
  }

  /**
   * Internal helper to prune by ID
   * @private
   */
  _removeEntry(event, id) {
    if (!this._listeners.has(event)) return;
    const list = this._listeners.get(event).filter(item => item.id !== id);
    if (list.length === 0) {
      this._listeners.delete(event);
    } else {
      this._listeners.set(event, list);
    }
  }

  /**
   * Clear listeners for an event or all events
   * @param {string} [event]
   */
  clear(event) {
    if (typeof event === 'string') {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
  }

  /**
   * Query listener count
   * @param {string} [event]
   * @returns {number}
   */
  listenerCount(event) {
    if (typeof event === 'string') {
      return this._listeners.has(event) ? this._listeners.get(event).length : 0;
    }
    let count = 0;
    for (const list of this._listeners.values()) {
      count += list.length;
    }
    return count;
  }

  /**
   * Check if an event has any registered listeners
   * @param {string} event
   * @returns {boolean}
   */
  hasListeners(event) {
    return this.listenerCount(event) > 0;
  }
}
