/**
 * Normalized constants for Customer Operations Workspace
 */

export const STATUSES = ['Open', 'In progress', 'Waiting', 'Escalated', 'Resolved']
export const STAGES = ['CS WhatsApp', 'CS E-mail', 'Opérations']
export const ACTIVE_STATUSES = STATUSES.filter(status => status !== 'Resolved')
