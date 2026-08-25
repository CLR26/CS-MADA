import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const hasValidConfig =
  typeof supabaseUrl === 'string' &&
  supabaseUrl.startsWith('http') &&
  typeof supabaseAnonKey === 'string' &&
  supabaseAnonKey.length > 10

// Données de démonstration initiales (permet de prévisualiser l'application immédiatement)
const INITIAL_DEMO_DEMANDES = [
  {
    id: 'demo-1',
    client_ref: 'Jae',
    objet: 'Lorem ipsum is dummy or placeholder text used in printing, graphic design, and web development.',
    situation: 'Lorem ipsum is dummy or placeholder text used in printing, graphic design, and web development. It has no actual, coherent meaning in modern English or Latin, but instead comes from scrambled and altered fragments of a 1st-century BC philosophical text by Cicero.',
    waiting_on: 'client',
    departement: null,
    created_by: 'agent-1',
    created_by_name: 'diary@suivi.com',
    created_at: new Date(Date.now() - 18 * 3600 * 1000).toISOString(),
    last_update_at: new Date(Date.now() - 18 * 3600 * 1000).toISOString(),
    resolved_at: null,
  },
  {
    id: 'demo-2',
    client_ref: 'Ragesh',
    objet: 'Colis non reçu',
    situation: 'Colis non reçu',
    waiting_on: 'departement',
    departement: 'GroundOps',
    created_by: 'agent-1',
    created_by_name: 'diary@suivi.com',
    created_at: new Date(Date.now() - 18 * 3600 * 1000).toISOString(),
    last_update_at: new Date(Date.now() - 18 * 3600 * 1000).toISOString(),
    resolved_at: null,
  },
  {
    id: 'demo-3',
    client_ref: 'Baa',
    objet: 'Facturation en double',
    situation: 'Lorem ipsum is dummy or placeholder text used in printing, graphic design, and web development. It has no actual, coherent meaning in modern English or Latin, but instead comes from scrambled fragments.',
    waiting_on: 'nous',
    departement: null,
    created_by: 'agent-1',
    created_by_name: 'diary@suivi.com',
    created_at: new Date(Date.now() - 52 * 3600 * 1000).toISOString(),
    last_update_at: new Date(Date.now() - 52 * 3600 * 1000).toISOString(),
    resolved_at: null,
  },
  {
    id: 'demo-4',
    client_ref: 'Claire Lefebvre',
    objet: 'Demande de relevé mensuel',
    situation: 'Relevé envoyé par email. Confirmation reçue du client.',
    waiting_on: 'nous',
    departement: 'FinanceOps',
    created_by: 'agent-1',
    created_by_name: 'diary@suivi.com',
    created_at: new Date(Date.now() - 72 * 3600 * 1000).toISOString(),
    last_update_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    resolved_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
  },
]

function getStoredDemoData() {
  try {
    const raw = localStorage.getItem('demo_demandes')
    if (raw) return JSON.parse(raw)
  } catch (e) {}
  return INITIAL_DEMO_DEMANDES
}

function saveDemoData(data) {
  try {
    localStorage.setItem('demo_demandes', JSON.stringify(data))
  } catch (e) {}
}

// Table générique (ex: demande_events) : persistance locale simple, vide par défaut.
function getStoredGenericTable(tableName) {
  try {
    const raw = localStorage.getItem(`demo_${tableName}`)
    if (raw) return JSON.parse(raw)
  } catch (e) {}
  return []
}

function saveGenericTable(tableName, data) {
  try {
    localStorage.setItem(`demo_${tableName}`, JSON.stringify(data))
  } catch (e) {}
}

// Client Fallback local (si Supabase n'est pas encore connecté en production)
function createMockClient() {
  let demoUser = {
    id: 'agent-diary',
    email: 'diary@suivi.com',
    user_metadata: { name: 'Diary Andriamala' },
  }
  let currentSession = { user: demoUser }
  const listeners = []

  return {
    auth: {
      async getSession() {
        return { data: { session: currentSession }, error: null }
      },
      onAuthStateChange(callback) {
        listeners.push(callback)
        // déclencher l'état initial
        setTimeout(() => callback('SIGNED_IN', currentSession), 10)
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                const idx = listeners.indexOf(callback)
                if (idx !== -1) listeners.splice(idx, 1)
              },
            },
          },
        }
      },
      async signInWithPassword({ email, password }) {
        if (!email || !password) return { data: { session: null }, error: new Error('Identifiants requis') }
        demoUser = {
          id: 'agent-' + email.split('@')[0],
          email,
          user_metadata: { name: email.split('@')[0] },
        }
        currentSession = { user: demoUser }
        listeners.forEach(fn => fn('SIGNED_IN', currentSession))
        return { data: { session: currentSession }, error: null }
      },
      async signOut() {
        currentSession = null
        listeners.forEach(fn => fn('SIGNED_OUT', null))
        return { error: null }
      },
    },
    from(tableName) {
      if (tableName === 'demandes') {
        return {
          select() {
            return {
              order() {
                return Promise.resolve({
                  data: getStoredDemoData(),
                  error: null,
                })
              },
            }
          },
          insert(payload) {
            return {
              select() {
                return {
                  single: async () => {
                    const items = getStoredDemoData()
                    const newItem = {
                      id: 'demo-' + Date.now(),
                      created_at: new Date().toISOString(),
                      last_update_at: new Date().toISOString(),
                      resolved_at: null,
                      ...payload,
                    }
                    const updated = [newItem, ...items]
                    saveDemoData(updated)
                    return { data: newItem, error: null }
                  },
                }
              },
            }
          },
          update(changes) {
            return {
              eq(col, val) {
                return {
                  select() {
                    return {
                      single: async () => {
                        const items = getStoredDemoData()
                        let modified = null
                        const updated = items.map(item => {
                          if (item[col] === val) {
                            modified = {
                              ...item,
                              ...changes,
                              last_update_at: new Date().toISOString(),
                            }
                            return modified
                          }
                          return item
                        })
                        saveDemoData(updated)
                        return { data: modified, error: null }
                      },
                    }
                  },
                }
              },
            }
          },
          delete() {
            return {
              eq: async (col, val) => {
                const items = getStoredDemoData()
                const filtered = items.filter(item => item[col] !== val)
                saveDemoData(filtered)
                return { error: null }
              },
            }
          },
        }
      }

      // Table générique : couvre notamment demande_events (chronologie « Situation actuelle »).
      return {
        select() {
          return {
            order() {
              return Promise.resolve({
                data: getStoredGenericTable(tableName),
                error: null,
              })
            },
          }
        },
        insert(payload) {
          return {
            select() {
              return {
                single: async () => {
                  const items = getStoredGenericTable(tableName)
                  const newItem = {
                    id: 'demo-' + Date.now() + '-' + Math.round(Math.random() * 1e6),
                    created_at: new Date().toISOString(),
                    ...payload,
                  }
                  const updated = [...items, newItem]
                  saveGenericTable(tableName, updated)
                  return { data: newItem, error: null }
                },
              }
            },
          }
        },
      }
    },
    storage: {
      from(bucket) {
        return {
          async upload(path) {
            // Mode démo local : aucun fichier n'est réellement téléversé.
            return { data: { path: `${bucket}/${path}` }, error: null }
          },
          getPublicUrl(path) {
            return { data: { publicUrl: `#demo-attachment/${bucket}/${path}` } }
          },
        }
      },
    },
    channel() {
      return {
        on() {
          return this
        },
        subscribe() {
          return this
        },
      }
    },
    removeChannel() {},
  }
}

export const supabase = hasValidConfig
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createMockClient()
