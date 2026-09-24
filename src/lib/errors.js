export function supabaseMessage(error, action) {
  if (error?.code === '42501') return 'Action refusée par les droits Supabase. Contacte l’administrateur de l’espace.'
  if (error?.code === '23502' || error?.code === '23514' || error?.code === 'PGRST204') {
    return 'La base de données n’accepte pas ces informations. Le schéma Supabase doit être vérifié.'
  }
  if (error?.code === '23503') return 'La personne sélectionnée n’est plus disponible. Actualise la liste puis réessaie.'
  return `Impossible de ${action}. Vérifie la connexion puis réessaie.`
}
