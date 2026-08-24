import { useEffect, useState } from 'react'
import Drawer from './ui/Drawer'
import Badge from './ui/Badge'
import Button from './ui/Button'
import TextArea from './ui/TextArea'
import Input from './ui/Input'
import ActivityFeed from './ActivityFeed'
import { formatDateTime, formatDuration, isStale } from '../lib/time'
import { IconCheck, IconRotateCcw, IconTrash, IconBuilding, IconUser, IconAlertTriangle } from '../lib/icons'

export default function RequestDrawer({
  demande,
  knownDepartments = [],
  currentUserId,
  events = [],
  onUpdate,
  onAssign,
  onResolve,
  onReopen,
  onDelete,
  onClose,
}) {
  const [situation, setSituation] = useState(demande?.situation || '')
  const [waitingOn, setWaitingOn] = useState(demande?.waiting_on || 'nous')
  const [departement, setDepartement] = useState(demande?.departement || '')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  // Mettre à jour l'état interne quand la demande sélectionnée change
  useEffect(() => {
    if (demande) {
      setSituation(demande.situation || '')
      setWaitingOn(demande.waiting_on || 'nous')
      setDepartement(demande.departement || '')
      setError(null)
      setConfirmDelete(false)
      setConfirmClose(false)
    }
  }, [demande])

  if (!demande) return null

  const isResolved = !!demande.resolved_at
  const stale = !isResolved && isStale(demande.last_update_at)

  const dirty =
    situation !== demande.situation ||
    waitingOn !== demande.waiting_on ||
    departement !== (demande.departement || '')

  function handleRequestClose() {
    if (confirmDelete) {
      setConfirmDelete(false)
      return
    }
    if (confirmClose) {
      setConfirmClose(false)
      return
    }
    if (dirty && !saving) {
      setConfirmClose(true)
      return
    }
    onClose()
  }

  async function handleSave() {
    if (!situation.trim()) {
      setError('La situation actuelle ne peut pas être vide.')
      return
    }
    if (waitingOn === 'departement' && !departement.trim()) {
      setError('Veuillez préciser le département concerné.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await onUpdate(demande.id, {
        situation: situation.trim(),
        waiting_on: waitingOn,
        departement: waitingOn === 'departement' ? departement.trim() : null,
      })
      onClose()
    } catch {
      setError('Erreur lors de la mise à jour. Veuillez réessayer.')
      setSaving(false)
    }
  }

  async function handleResolveAction() {
    if (dirty && !situation.trim()) {
      setError('La situation ne peut pas être vide.')
      return
    }
    if (waitingOn === 'departement' && !departement.trim()) {
      setError('Veuillez préciser le
