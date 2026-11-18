# User Glossary

Operator terminology used by PM Ops Map. Open **Terms & Help** in the application to search these definitions.

<!-- Generated from js/glossaryData.js. Edit that source, then run npm run glossary:generate. -->

Definitions describe application behavior, not legal requirements. Responsibility owners and property owners are distinct. Setup progress is separate from operational readiness.

## Setup and workspace

### Operation

The people, responsibilities, information, and routines used to manage your properties. PM Ops Map helps you organize these elements and identify gaps.

### Workspace

Your company’s responsibility map, team, portfolio records, and work orders. By default, this information is saved in the current browser. Optional Team Sync can share workspace data between browsers.

### Starter property

The property selected as the starting point for your setup walkthrough. Selecting it helps guide contact entry; responsibility assignments remain company-wide.

### Setup progress

Your progress through the seven setup steps. It combines information recorded in your workspace with reviews you acknowledge. It is separate from operational readiness.

### Deferred step

A setup step you chose to revisit later. Deferring a step keeps it outstanding rather than marking it complete.

Search aliases: defer.

### Not applicable

A specific setup requirement does not apply to your current situation. For example, resident entry can be marked not applicable for a vacant starter property.

Search aliases: vacant, vacancy.

### Setup review

Your review of the starting setup and its remaining gaps. Finishing this review does not complete deferred steps or confirm that the business is fully ready to operate.

### Readiness score

A calculated planning indicator based on recorded ownership, staffing, portfolio, maintenance, checklist, and data-quality signals. It does not certify compliance, staffing capacity, or operational readiness.

Search aliases: readiness.

## People and responsibility

### Responsibility / Task

A named item of work in the company’s responsibility map. It can have an owner, status, priority, due date, dependencies, and notes.

Search aliases: responsibility, task.

### Responsibility owner

The person named as responsible for a task. Assigning an owner records accountability; it does not confirm that the person has accepted the work or has the capacity to perform it.

Search aliases: owner, task owner.

### Property owner

The person or organization that owns a managed property. This is different from the owner assigned to a responsibility.

### Assignee

The person named to handle a work order. The assignee coordinates or carries out the work; a vendor can be recorded separately.

### Roster

The list of people recorded in your workspace. It can contain one solo operator or a larger team. Roster entries are not user accounts or access permissions.

Search aliases: team, employee.

### Department

A grouping of related responsibilities, such as maintenance, accounting, or leasing. It organizes work and does not require a separate department in your company.

### Department affinity

A department associated with a person for assignment purposes. Auto-Assign prefers people with matching affinities; an affinity is not a verified qualification or availability commitment.

Search aliases: affinity, affinities.

### Auto-Assign

A tool that assigns unowned responsibilities, preferring people with matching department affinities and fewer assigned tasks. It balances task counts rather than estimated effort, hours, or availability.

Search aliases: auto assign, autoassign.

### Unowned

A responsibility with no named owner. The app displays it as UNOWNED so the ownership gap can be reviewed.

### Unassigned

A work order with no named assignee. This is separate from an unowned responsibility in the company map.

## Work, status, and coverage

### Coverage

An indication of how much work has named owners. The full map counts responsibilities with a named owner; the starter checklist also checks that owners are on the confirmed roster. Coverage does not measure capacity or qualifications.

### Workload

The number of responsibilities assigned to a person. Use it to compare assignment distribution, while considering that tasks can differ substantially in effort and frequency.

### Priority

The recorded importance or urgency of a task or work order. Priority helps organize attention; it does not automatically establish a response deadline.

### To Do

A responsibility recorded as awaiting action. This status does not indicate whether an owner or due date has been assigned.

Search aliases: todo.

### In Progress

A task or work order recorded as being actively worked on. Users maintain this status; the app does not independently verify activity.

### Blocked

A responsibility recorded as unable to move forward. Notes and dependencies can help explain what must happen next.

### Dependency

A link identifying another responsibility that must be addressed before the current responsibility can proceed.

Search aliases: dependencies.

### Overdue

A responsibility whose recorded due date has passed and whose status is not Done. It indicates a need for review, not an independently verified service or legal breach.

### Done

A responsibility marked finished by a user. This status applies to the recorded task and does not automatically complete related work orders.

## Maintenance

### Work order

A record used to coordinate a maintenance request or repair. It can include property details, an issue description, an assignee, a vendor, priority, a target date, estimated cost, and notes.

Search aliases: work orders, repair.

### Vendor

A person or business recorded as a service provider. A vendor record does not verify insurance, qualifications, availability, or an agreement to perform work.

### Submitted

A work order recorded in the intake stage. This status alone does not confirm that someone has reviewed or accepted it.

### Scheduled

A work order marked as scheduled by a user. The status does not independently confirm an appointment with the resident or vendor.

### Completed

A work order marked finished by a user. The app does not independently verify repair quality, resident satisfaction, invoice payment, or supporting evidence.

## Portfolio and operating records

### Portfolio

The collection of property, resident, and vendor records in your workspace. These records provide operating context rather than a complete property-management or accounting system.

### Unit

An individual rental space within a property, such as an apartment, house, or commercial suite.

### Resident / Tenant

A person recorded in connection with a property or unit. PM Ops Map uses tenant records for contact, lease, and balance information; the record does not determine a person’s legal occupancy status.

Search aliases: resident, tenant.

## Storage and sharing

### Browser storage

Storage associated with the browser and site you are using. PM Ops Map saves data there by default, without encrypting it. Clearing site data or changing browsers can make that local workspace unavailable.

Search aliases: localStorage, local storage.

### Backup

A saved workspace snapshot that can be restored. Automatic backups remain in the browser and can be removed by certain reset options; they are not an independent off-device copy.

Search aliases: backups, snapshot.

### Export

A file or copied representation of workspace information for saving or sharing. An export is a separate copy and does not update automatically when the workspace changes.

### Import

Applying information from an external file or copied workspace. Full-workspace imports can replace existing data after review; portfolio CSV imports append accepted records.

### Team Sync

An optional service for sharing workspace snapshots through a self-hosted server. It uses a workspace name and passphrase for a trusted team; it does not provide individual accounts or staff permissions.

Search aliases: sync.
