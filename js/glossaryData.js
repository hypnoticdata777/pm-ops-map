/** Approved operator terminology. Generated Markdown and in-app help share this source. */
/** @typedef {{id:string, term:string, category:string, aliases:readonly string[], definition:string}} GlossaryEntry */
export const GLOSSARY_CATEGORIES = Object.freeze([
  {
    "id": "setup",
    "label": "Setup and workspace"
  },
  {
    "id": "people",
    "label": "People and responsibility"
  },
  {
    "id": "work",
    "label": "Work, status, and coverage"
  },
  {
    "id": "maintenance",
    "label": "Maintenance"
  },
  {
    "id": "portfolio",
    "label": "Portfolio and operating records"
  },
  {
    "id": "data",
    "label": "Storage and sharing"
  }
]);
/** @type {readonly GlossaryEntry[]} */
export const GLOSSARY_ENTRIES = Object.freeze([
  {
    "id": "operation",
    "term": "Operation",
    "category": "setup",
    "aliases": [],
    "definition": "The people, responsibilities, information, and routines used to manage your properties. PM Ops Map helps you organize these elements and identify gaps."
  },
  {
    "id": "workspace",
    "term": "Workspace",
    "category": "setup",
    "aliases": [],
    "definition": "Your company’s responsibility map, team, portfolio records, and work orders. By default, this information is saved in the current browser. Optional Team Sync can share workspace data between browsers."
  },
  {
    "id": "starter-property",
    "term": "Starter property",
    "category": "setup",
    "aliases": [],
    "definition": "The property selected as the starting point for your setup walkthrough. Selecting it helps guide contact entry; responsibility assignments remain company-wide."
  },
  {
    "id": "setup-progress",
    "term": "Setup progress",
    "category": "setup",
    "aliases": [],
    "definition": "Your progress through the seven setup steps. It combines information recorded in your workspace with reviews you acknowledge. It is separate from operational readiness."
  },
  {
    "id": "deferred-step",
    "term": "Deferred step",
    "category": "setup",
    "aliases": [
      "defer"
    ],
    "definition": "A setup step you chose to revisit later. Deferring a step keeps it outstanding rather than marking it complete."
  },
  {
    "id": "not-applicable",
    "term": "Not applicable",
    "category": "setup",
    "aliases": [
      "vacant",
      "vacancy"
    ],
    "definition": "A specific setup requirement does not apply to your current situation. For example, resident entry can be marked not applicable for a vacant starter property."
  },
  {
    "id": "setup-review",
    "term": "Setup review",
    "category": "setup",
    "aliases": [],
    "definition": "Your review of the starting setup and its remaining gaps. Finishing this review does not complete deferred steps or confirm that the business is fully ready to operate."
  },
  {
    "id": "readiness-score",
    "term": "Readiness score",
    "category": "setup",
    "aliases": [
      "readiness"
    ],
    "definition": "A calculated planning indicator based on recorded ownership, staffing, portfolio, maintenance, checklist, and data-quality signals. It does not certify compliance, staffing capacity, or operational readiness."
  },
  {
    "id": "responsibility",
    "term": "Responsibility / Task",
    "category": "people",
    "aliases": [
      "responsibility",
      "task"
    ],
    "definition": "A named item of work in the company’s responsibility map. It can have an owner, status, priority, due date, dependencies, and notes."
  },
  {
    "id": "responsibility-owner",
    "term": "Responsibility owner",
    "category": "people",
    "aliases": [
      "owner",
      "task owner"
    ],
    "definition": "The person named as responsible for a task. Assigning an owner records accountability; it does not confirm that the person has accepted the work or has the capacity to perform it."
  },
  {
    "id": "property-owner",
    "term": "Property owner",
    "category": "people",
    "aliases": [],
    "definition": "The person or organization that owns a managed property. This is different from the owner assigned to a responsibility."
  },
  {
    "id": "assignee",
    "term": "Assignee",
    "category": "people",
    "aliases": [],
    "definition": "The person named to handle a work order. The assignee coordinates or carries out the work; a vendor can be recorded separately."
  },
  {
    "id": "roster",
    "term": "Roster",
    "category": "people",
    "aliases": [
      "team",
      "employee"
    ],
    "definition": "The list of people recorded in your workspace. It can contain one solo operator or a larger team. Roster entries are not user accounts or access permissions."
  },
  {
    "id": "department",
    "term": "Department",
    "category": "people",
    "aliases": [],
    "definition": "A grouping of related responsibilities, such as maintenance, accounting, or leasing. It organizes work and does not require a separate department in your company."
  },
  {
    "id": "department-affinity",
    "term": "Department affinity",
    "category": "people",
    "aliases": [
      "affinity",
      "affinities"
    ],
    "definition": "A department associated with a person for assignment purposes. Auto-Assign prefers people with matching affinities; an affinity is not a verified qualification or availability commitment."
  },
  {
    "id": "auto-assign",
    "term": "Auto-Assign",
    "category": "people",
    "aliases": [
      "auto assign",
      "autoassign"
    ],
    "definition": "A tool that assigns unowned responsibilities, preferring people with matching department affinities and fewer assigned tasks. It balances task counts rather than estimated effort, hours, or availability."
  },
  {
    "id": "unowned",
    "term": "Unowned",
    "category": "people",
    "aliases": [],
    "definition": "A responsibility with no named owner. The app displays it as UNOWNED so the ownership gap can be reviewed."
  },
  {
    "id": "unassigned",
    "term": "Unassigned",
    "category": "people",
    "aliases": [],
    "definition": "A work order with no named assignee. This is separate from an unowned responsibility in the company map."
  },
  {
    "id": "coverage",
    "term": "Coverage",
    "category": "work",
    "aliases": [],
    "definition": "An indication of how much work has named owners. The full map counts responsibilities with a named owner; the starter checklist also checks that owners are on the confirmed roster. Coverage does not measure capacity or qualifications."
  },
  {
    "id": "workload",
    "term": "Workload",
    "category": "work",
    "aliases": [],
    "definition": "The number of responsibilities assigned to a person. Use it to compare assignment distribution, while considering that tasks can differ substantially in effort and frequency."
  },
  {
    "id": "priority",
    "term": "Priority",
    "category": "work",
    "aliases": [],
    "definition": "The recorded importance or urgency of a task or work order. Priority helps organize attention; it does not automatically establish a response deadline."
  },
  {
    "id": "to-do",
    "term": "To Do",
    "category": "work",
    "aliases": [
      "todo"
    ],
    "definition": "A responsibility recorded as awaiting action. This status does not indicate whether an owner or due date has been assigned."
  },
  {
    "id": "in-progress",
    "term": "In Progress",
    "category": "work",
    "aliases": [],
    "definition": "A task or work order recorded as being actively worked on. Users maintain this status; the app does not independently verify activity."
  },
  {
    "id": "blocked",
    "term": "Blocked",
    "category": "work",
    "aliases": [],
    "definition": "A responsibility recorded as unable to move forward. Notes and dependencies can help explain what must happen next."
  },
  {
    "id": "dependency",
    "term": "Dependency",
    "category": "work",
    "aliases": [
      "dependencies"
    ],
    "definition": "A link identifying another responsibility that must be addressed before the current responsibility can proceed."
  },
  {
    "id": "overdue",
    "term": "Overdue",
    "category": "work",
    "aliases": [],
    "definition": "A responsibility whose recorded due date has passed and whose status is not Done. It indicates a need for review, not an independently verified service or legal breach."
  },
  {
    "id": "done",
    "term": "Done",
    "category": "work",
    "aliases": [],
    "definition": "A responsibility marked finished by a user. This status applies to the recorded task and does not automatically complete related work orders."
  },
  {
    "id": "work-order",
    "term": "Work order",
    "category": "maintenance",
    "aliases": [
      "work orders",
      "repair"
    ],
    "definition": "A record used to coordinate a maintenance request or repair. It can include property details, an issue description, an assignee, a vendor, priority, a target date, estimated cost, and notes."
  },
  {
    "id": "vendor",
    "term": "Vendor",
    "category": "maintenance",
    "aliases": [],
    "definition": "A person or business recorded as a service provider. A vendor record does not verify insurance, qualifications, availability, or an agreement to perform work."
  },
  {
    "id": "submitted",
    "term": "Submitted",
    "category": "maintenance",
    "aliases": [],
    "definition": "A work order recorded in the intake stage. This status alone does not confirm that someone has reviewed or accepted it."
  },
  {
    "id": "scheduled",
    "term": "Scheduled",
    "category": "maintenance",
    "aliases": [],
    "definition": "A work order marked as scheduled by a user. The status does not independently confirm an appointment with the resident or vendor."
  },
  {
    "id": "completed",
    "term": "Completed",
    "category": "maintenance",
    "aliases": [],
    "definition": "A work order marked finished by a user. The app does not independently verify repair quality, resident satisfaction, invoice payment, or supporting evidence."
  },
  {
    "id": "portfolio",
    "term": "Portfolio",
    "category": "portfolio",
    "aliases": [],
    "definition": "The collection of property, resident, and vendor records in your workspace. These records provide operating context rather than a complete property-management or accounting system."
  },
  {
    "id": "unit",
    "term": "Unit",
    "category": "portfolio",
    "aliases": [],
    "definition": "An individual rental space within a property, such as an apartment, house, or commercial suite."
  },
  {
    "id": "resident",
    "term": "Resident / Tenant",
    "category": "portfolio",
    "aliases": [
      "resident",
      "tenant"
    ],
    "definition": "A person recorded in connection with a property or unit. PM Ops Map uses tenant records for contact, lease, and balance information; the record does not determine a person’s legal occupancy status."
  },
  {
    "id": "browser-storage",
    "term": "Browser storage",
    "category": "data",
    "aliases": [
      "localStorage",
      "local storage"
    ],
    "definition": "Storage associated with the browser and site you are using. PM Ops Map saves data there by default, without encrypting it. Clearing site data or changing browsers can make that local workspace unavailable."
  },
  {
    "id": "backup",
    "term": "Backup",
    "category": "data",
    "aliases": [
      "backups",
      "snapshot"
    ],
    "definition": "A saved workspace snapshot that can be restored. Automatic backups remain in the browser and can be removed by certain reset options; they are not an independent off-device copy."
  },
  {
    "id": "export",
    "term": "Export",
    "category": "data",
    "aliases": [],
    "definition": "A file or copied representation of workspace information for saving or sharing. An export is a separate copy and does not update automatically when the workspace changes."
  },
  {
    "id": "import",
    "term": "Import",
    "category": "data",
    "aliases": [],
    "definition": "Applying information from an external file or copied workspace. Full-workspace imports can replace existing data after review; portfolio CSV imports append accepted records."
  },
  {
    "id": "team-sync",
    "term": "Team Sync",
    "category": "data",
    "aliases": [
      "sync"
    ],
    "definition": "An optional service for sharing workspace snapshots through a self-hosted server. It uses a workspace name and passphrase for a trusted team; it does not provide individual accounts or staff permissions."
  }
].map(entry => Object.freeze({ ...entry, aliases: Object.freeze(entry.aliases) })));
