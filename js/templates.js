export const ROLE_TEMPLATES = {
  solo: {
    label: 'Solo PM',
    description: 'One operator owns every lane, with maintenance/vendor work highlighted for daily review.',
    employees: [
      { name: 'Owner Operator', hex: '#1976d2', affinities: ['leasing', 'applications', 'move-ins', 'tenant-comms', 'delinquency', 'maintenance', 'vendors', 'unit-turns', 'move-outs', 'field-services', 'utilities', 'owner-relations', 'owner-onboarding', 'accounting', 'compliance', 'reporting', 'systems'] },
    ],
  },
  twoPerson: {
    label: '2-Person Team',
    description: 'Split front-office leasing/comms from back-office maintenance/accounting.',
    employees: [
      { name: 'Portfolio Lead', hex: '#00897b', affinities: ['leasing', 'applications', 'move-ins', 'tenant-comms', 'owner-relations', 'owner-onboarding', 'reporting'] },
      { name: 'Ops Coordinator', hex: '#ef6c00', affinities: ['maintenance', 'vendors', 'unit-turns', 'move-outs', 'field-services', 'utilities', 'delinquency', 'accounting', 'compliance', 'systems'] },
    ],
  },
  maintenanceHeavy: {
    label: 'Maintenance-Heavy',
    description: 'Prioritize repair intake, vendors, turns, access, and tenant updates.',
    employees: [
      { name: 'Maintenance Coordinator', hex: '#d32f2f', affinities: ['maintenance', 'vendors', 'unit-turns', 'field-services'] },
      { name: 'Resident Coordinator', hex: '#7b1fa2', affinities: ['tenant-comms', 'move-ins', 'move-outs', 'leasing', 'applications'] },
      { name: 'Portfolio Admin', hex: '#455a64', affinities: ['owner-relations', 'accounting', 'utilities', 'compliance', 'reporting', 'systems', 'delinquency'] },
    ],
  },
  leasingHeavy: {
    label: 'Leasing-Heavy',
    description: 'Separate growth, applicant flow, and onboarding from daily operations.',
    employees: [
      { name: 'Leasing Lead', hex: '#2e7d32', affinities: ['leasing', 'applications', 'move-ins', 'owner-onboarding'] },
      { name: 'Operations Lead', hex: '#1565c0', affinities: ['tenant-comms', 'maintenance', 'vendors', 'unit-turns', 'move-outs', 'field-services'] },
      { name: 'Accounting Admin', hex: '#6d4c41', affinities: ['delinquency', 'accounting', 'utilities', 'owner-relations', 'compliance', 'reporting', 'systems'] },
    ],
  },
};

export const SOP_TEMPLATES = [
  {
    title: 'Daily Operating Huddle',
    cadence: 'Daily',
    steps: [
      'Review unowned, blocked, and overdue responsibilities.',
      'Check open work orders and assign every unassigned repair.',
      'Confirm same-day tenant, vendor, and owner communications.',
      'Escalate emergencies, notices, and owner-approval issues.',
    ],
  },
  {
    title: 'Maintenance Intake',
    cadence: 'Every request',
    steps: [
      'Capture property, unit, resident, issue, priority, access notes, vendor, assignee, target date, and estimated cost.',
      'Assign an internal owner before dispatching a vendor.',
      'Move work through submitted, scheduled, in progress, and completed.',
      'Close the loop with the tenant, vendor, owner/client, and invoice record.',
    ],
  },
  {
    title: 'Owner Update',
    cadence: 'Weekly',
    steps: [
      'Summarize leasing, delinquency, maintenance, turns, and compliance exceptions.',
      'Flag decisions needed from the owner/client.',
      'Confirm next actions, dates, and responsible team members.',
      'Update the operating map before exporting a fresh handbook.',
    ],
  },
  {
    title: 'Move-In Handoff',
    cadence: 'Per move-in',
    steps: [
      'Confirm lease, funds, keys/access, utilities, inspection, and resident contact details.',
      'Assign onboarding, first maintenance contact, and owner notification tasks.',
      'Create any immediate work orders before the resident receives keys.',
    ],
  },
];

/** @param {string | number | Date} from @param {number} days @returns {string} */
function _isoDateOffset(from, days) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function buildDemoWorkspace(now = new Date()) {
  const stamp = now.getTime();
  const propertyId = `demo-property-${stamp}`;
  return {
    company: 'Demo Door Property Management',
    profile: {
      company: 'Demo Door Property Management',
      portfolioSize: 'small',
      focus: 'maintenance',
      configuredAt: now.toISOString(),
    },
    portfolio: {
      properties: [
        {
          id: propertyId,
          name: 'Oak Street Duplex',
          units: 2,
          owner: 'Rivera Family LLC',
          notes: 'Owner prefers text updates before non-urgent repairs.',
          documentUrl: 'https://example.com/documents/oak-street-deed.pdf',
          createdAt: now.toISOString(),
        },
      ],
      tenants: [
        {
          id: `demo-tenant-${stamp}`,
          name: 'Maya Chen',
          propertyId,
          unit: '2B',
          status: 'active',
          phone: '(555) 010-2040',
          email: 'maya.chen@example.com',
          rent: 1450,
          leaseStart: _isoDateOffset(now, -320),
          leaseEnd: _isoDateOffset(now, 45),
          balanceDue: 450,
          documentUrl: 'https://example.com/documents/maya-chen-lease.pdf',
          createdAt: now.toISOString(),
        },
      ],
      vendors: [
        {
          id: `demo-vendor-${stamp}`,
          name: 'Ace Plumbing',
          trade: 'Plumbing',
          phone: '(555) 010-1188',
          email: 'dispatch@aceplumbing.example',
          documentUrl: 'https://example.com/documents/ace-plumbing-coi.pdf',
          createdAt: now.toISOString(),
        },
      ],
    },
    workOrders: [
      {
        id: `demo-wo-${stamp}`,
        property: 'Oak Street Duplex',
        unit: '2B',
        tenant: 'Maya Chen',
        title: 'Kitchen sink leak',
        notes: 'Resident reports slow drip under sink. Confirm access window before dispatch.',
        priority: 'high',
        status: 'submitted',
        assignee: 'Maintenance Coordinator',
        vendor: 'Ace Plumbing',
        dueDate: null,
        cost: 0,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    ],
  };
}
