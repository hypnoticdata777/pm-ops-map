// Shared type definitions (JSDoc). This file has no runtime code: it exists so the
// shapes below can be imported into any module's JSDoc:
//
//   /** @import { Task, Employee } from './types.js' */
//
// `npm run typecheck` checks them. Status / priority fields are plain strings whose
// allowed values live in state.js (STATUS_CYCLE, PRIORITY_CYCLE, WO_STATUS_CYCLE) and
// are enforced at the boundary by normalize.js, so a value of the right *type* is not
// necessarily an allowed *value* until it has been through a sanitizer.

/**
 * A dependency: this task is blocked until another task is done. `taskId` is the
 * permanent reference; `configName` is what versions before task ids wrote.
 * @typedef {object} BlockedBy
 * @property {string} deptId     Department that held the blocker when the link was made.
 * @property {string} [taskId]   Permanent id of the blocking task (schema v4+).
 * @property {string} [configName] Starter name of the blocking task (legacy reference).
 * @property {string} name       Display name of the blocker when the link was made.
 */

/**
 * One responsibility. Starter tasks come from config.json; user edits are merged on top.
 * @typedef {object} Task
 * @property {string} id              Permanent id such as "maintenance-014".
 * @property {string} name            Visible name; the user may edit it.
 * @property {string} owner           Employee name, or "UNOWNED".
 * @property {string} [status]        "todo" | "in-progress" | "blocked" | "done".
 * @property {string} [priority]      "high" | "medium" | "low".
 * @property {string | null} [dueDate]  YYYY-MM-DD.
 * @property {BlockedBy | null} [blockedBy]
 * @property {string | null} [notes]
 * @property {Record<string, string> | null} [customFields]
 * @property {string} [_configName]   The starter name this task had at boot (legacy match key).
 * @property {string[]} [aliases]     Former starter names, listed in config.json after a reword.
 */

/**
 * @typedef {object} Department
 * @property {string} id
 * @property {string} name
 * @property {string} color
 * @property {Task[]} tasks
 */

/**
 * @typedef {object} OrgData
 * @property {string} [company]
 * @property {Department[]} departments
 */

/**
 * @typedef {object} Employee
 * @property {string} name
 * @property {string} hex            "#rrggbb".
 * @property {string[]} affinities   Department ids this person is best placed to own.
 */

/** @typedef {{ employees: Employee[] }} Team */

/**
 * @typedef {object} WorkOrder
 * @property {string} id
 * @property {string} property
 * @property {string} unit
 * @property {string} tenant
 * @property {string} title
 * @property {string} notes
 * @property {string} priority       "high" | "medium" | "low".
 * @property {string} status         "submitted" | "scheduled" | "in-progress" | "completed".
 * @property {string} assignee       Employee name or "UNASSIGNED".
 * @property {string} vendor
 * @property {string | null} dueDate
 * @property {number} cost
 * @property {string} [createdAt]    ISO timestamp.
 * @property {string} [updatedAt]
 */

/**
 * @typedef {object} Property
 * @property {string} id
 * @property {string} name
 * @property {number} units
 * @property {string} owner          Owner / client.
 * @property {string} notes
 * @property {string} documentUrl    http(s) link or "".
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {object} Tenant
 * @property {string} id
 * @property {string} name
 * @property {string} propertyId     Id of an existing Property, or "".
 * @property {string} unit
 * @property {string} status         "active" | "applicant" | "notice" | "past".
 * @property {string} phone
 * @property {string} email
 * @property {number} rent
 * @property {string} leaseStart     YYYY-MM-DD or "".
 * @property {string} leaseEnd
 * @property {number} balanceDue
 * @property {string} [lastPaymentDate]
 * @property {string} documentUrl
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {object} Vendor
 * @property {string} id
 * @property {string} name
 * @property {string} trade
 * @property {string} phone
 * @property {string} email
 * @property {string} documentUrl
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/** @typedef {{ properties: Property[], tenants: Tenant[], vendors: Vendor[] }} Portfolio */

/**
 * @typedef {object} AuditEntry
 * @property {string} ts
 * @property {string} action
 * @property {string} [dept]
 * @property {string} [task]
 * @property {string} [title]
 * @property {string} [label]
 * @property {string | number | null} [from]
 * @property {string | number | null} [to]
 * @property {number} [count]
 */

/**
 * What a task looks like inside a saved/exported payload.
 * @typedef {object} PayloadTask
 * @property {string} [id]
 * @property {string} [_configName]
 * @property {string} name
 * @property {string} owner
 * @property {string} [status]
 * @property {string} [priority]
 * @property {string | null} [dueDate]
 * @property {BlockedBy | null} [blockedBy]
 * @property {string | null} [notes]
 * @property {Record<string, string> | null} [customFields]
 */

/**
 * @typedef {object} PayloadDepartment
 * @property {string} id
 * @property {string} [name]
 * @property {PayloadTask[]} tasks
 */

/**
 * The portable workspace (JSON export, clipboard copy, Team Sync snapshot). Schema v4.
 * @typedef {object} WorkspacePayload
 * @property {string} schema          Always "pm-ops-map-state".
 * @property {number} schemaVersion
 * @property {string} app
 * @property {string} company
 * @property {string} exported        ISO timestamp.
 * @property {PayloadDepartment[]} departments
 * @property {Team} team
 * @property {WorkOrder[]} workOrders
 * @property {Portfolio} portfolio
 */

/**
 * One thing a validator had to repair, drop or reject, located by field path.
 * @typedef {object} Issue
 * @property {string} path      e.g. "workOrders[2].priority".
 * @property {string} [field]
 * @property {string} code      e.g. "invalid_value", "missing_required", "unknown_reference".
 * @property {string} message   A sentence for the import review.
 */

/**
 * @typedef {object} CollectionStats
 * @property {number} kept
 * @property {number} dropped
 * @property {number} repaired
 */

/**
 * The import review's picture of a file before anything is applied.
 * @typedef {object} ImportReport
 * @property {boolean} ok
 * @property {string[]} errors
 * @property {string[]} warnings
 * @property {unknown} schemaVersion  Exactly as written in the file (untrusted: not necessarily a number); display it with String().
 * @property {string} company
 * @property {number} matchedDepartments
 * @property {number} matchedTasks
 * @property {number} skippedDepartments
 * @property {number} skippedTasks
 * @property {number} invalidDueDates
 * @property {number} invalidTasks
 * @property {number} repairedRecords
 * @property {number} droppedRecords
 * @property {Issue[]} issues         Capped; see issueCount for the true total.
 * @property {number} issueCount
 * @property {number} teamMembers
 * @property {number} workOrders
 * @property {number} properties
 * @property {number} tenants
 * @property {number} vendors
 */

export {};
