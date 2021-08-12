const k8s = require('@kubernetes/client-node');

/**
 * Kubernates Container driver
 * 
 * Handles the creation and deletation of containers to back Projects
 * 
 * This driver creates Projects backed by Kubernates 
 * 
 * @module kubernates
 * @memberof forge.containers.drivers
 * 
 */

module.exports = {
  init: async (app, options) => {
    this._app = app
    const kc = new k8s.KubeConfig()
    kc.loadFromDefault()
  },
  create: async (name, options) => {

  },
  remove: async (name) => {
    
  },
  details: async (name) => {

  },
  start: async (name) => {

  },
  stop: async (name) => {

  },
  restart: async (name) => {
    
  }
}