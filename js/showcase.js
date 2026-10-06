// The workspace behind the hosted demo (?demo=1): entirely fictional, deterministic,
// and shaped to show what the tool is FOR rather than a wall of identical rows.
//
//   - three departments nobody covers (compliance, reporting, systems) -> unowned gaps
//   - one person carrying far more than the others -> overload
//   - a blocked chain, an overdue item, a mix of done / in-progress / to-do
//   - notes and custom fields on a few responsibilities
//   - tenants in different lease and rent situations, work orders in every column
//
// Everything is pure: dates are computed from `now`, so the demo never goes stale
// (something "due in 2 days" is always due in 2 days), and nothing here touches
// shared state — demo.js applies the result. All names, phones (555-01xx) and
// addresses (example.com) are made up.

const DAY_MS = 86_400_000;

const isoDate = (now, days) => {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const isoStamp = (now, days) => new Date(now.getTime() + days * DAY_MS).toISOString();

export const SHOWCASE_COMPANY = 'Demo Door Property Management';

// Departments with no one assigned on purpose — the gaps the map is meant to expose.
export const UNCOVERED_DEPARTMENTS = ['compliance', 'reporting', 'systems'];

const TEAM = [
  {
    name: 'Dana Whitfield', hex: '#1565c0',
    affinities: ['accounting', 'owner-relations', 'owner-onboarding', 'delinquency', 'utilities', 'vendors'],
  },
  {
    name: 'Marcus Reyes', hex: '#d32f2f',
    affinities: ['maintenance', 'unit-turns', 'field-services'],
  },
  {
    name: 'Priya Raman', hex: '#2e7d32',
    affinities: ['leasing', 'applications', 'move-ins', 'move-outs', 'tenant-comms'],
  },
];

export function buildShowcase(now = new Date()) {
  const team = { employees: TEAM.map(emp => ({ ...emp, affinities: [...emp.affinities] })) };

  const properties = [
    {
      id: 'demo-property-oak', name: 'Oak Street Duplex', units: 2, owner: 'Rivera Family LLC',
      notes: 'Owner prefers a text before any non-urgent repair.',
      documentUrl: 'https://example.com/documents/oak-street-deed.pdf', createdAt: isoStamp(now, -200),
    },
    {
      id: 'demo-property-cedar', name: 'Cedar Court Apartments', units: 12, owner: 'Alder Hill Partners',
      notes: 'Gate keypad and boiler room are on the monthly walk-through.',
      documentUrl: 'https://example.com/documents/cedar-court-insurance.pdf', createdAt: isoStamp(now, -180),
    },
  ];

  const tenants = [
    {
      id: 'demo-tenant-1', name: 'Maya Chen', propertyId: 'demo-property-oak', unit: '2B', status: 'active',
      phone: '(555) 010-2041', email: 'maya.chen@example.com', rent: 1450,
      leaseStart: isoDate(now, -320), leaseEnd: isoDate(now, 45), balanceDue: 450,
      lastPaymentDate: isoDate(now, -18), documentUrl: 'https://example.com/documents/maya-chen-lease.pdf',
      createdAt: isoStamp(now, -320),
    },
    {
      id: 'demo-tenant-2', name: 'Jordan Ellis', propertyId: 'demo-property-cedar', unit: '4A', status: 'active',
      phone: '(555) 010-2042', email: 'jordan.ellis@example.com', rent: 1325,
      leaseStart: isoDate(now, -120), leaseEnd: isoDate(now, 245), balanceDue: 0,
      lastPaymentDate: isoDate(now, -4), createdAt: isoStamp(now, -120),
    },
    {
      id: 'demo-tenant-3', name: 'Priya Nair', propertyId: 'demo-property-cedar', unit: '7C', status: 'notice',
      phone: '(555) 010-2043', email: 'priya.nair@example.com', rent: 1580,
      leaseStart: isoDate(now, -345), leaseEnd: isoDate(now, 20), balanceDue: 1580,
      lastPaymentDate: isoDate(now, -62), createdAt: isoStamp(now, -345),
    },
    {
      id: 'demo-tenant-4', name: 'Sam Okafor', propertyId: 'demo-property-cedar', unit: '2D', status: 'active',
      phone: '(555) 010-2044', email: 'sam.okafor@example.com', rent: 1290,
      leaseStart: isoDate(now, -370), leaseEnd: isoDate(now, -5), balanceDue: 0,
      lastPaymentDate: isoDate(now, -9), createdAt: isoStamp(now, -370),
    },
  ];

  const vendors = [
    {
      id: 'demo-vendor-1', name: 'Ace Plumbing', trade: 'Plumbing', phone: '(555) 010-1188',
      email: 'dispatch@aceplumbing.example', documentUrl: 'https://example.com/documents/ace-plumbing-coi.pdf',
      createdAt: isoStamp(now, -150),
    },
    {
      id: 'demo-vendor-2', name: 'BrightSpark Electric', trade: 'Electrical', phone: '(555) 010-1190',
      email: 'service@brightspark.example', createdAt: isoStamp(now, -140),
    },
    {
      id: 'demo-vendor-3', name: 'ClearView HVAC', trade: 'HVAC', phone: '(555) 010-1192',
      email: 'help@clearviewhvac.example', createdAt: isoStamp(now, -130),
    },
  ];

  const order = (n, fields) => ({
    id: `demo-wo-${n}`, unit: '', tenant: '', notes: '', vendor: '', dueDate: null, cost: 0,
    createdAt: isoStamp(now, -6), updatedAt: isoStamp(now, -1), ...fields,
  });
  const workOrders = [
    order(1, {
      property: 'Cedar Court Apartments', unit: '7C', tenant: 'Priya Nair', title: 'No hot water in unit 7C',
      notes: 'Resident reports none since last night. Boiler room check first.', status: 'submitted',
      priority: 'high', assignee: 'UNASSIGNED', dueDate: isoDate(now, 1), createdAt: isoStamp(now, -1),
    }),
    order(2, {
      property: 'Cedar Court Apartments', title: 'Replace hallway light fixture (3rd floor)', vendor: 'BrightSpark Electric',
      status: 'submitted', priority: 'medium', assignee: 'Marcus Reyes', dueDate: isoDate(now, 6),
    }),
    order(3, {
      property: 'Oak Street Duplex', unit: '2B', tenant: 'Maya Chen', title: 'Kitchen sink leak', vendor: 'Ace Plumbing',
      notes: 'Slow drip under the sink. Confirm the access window before dispatch.', status: 'scheduled',
      priority: 'high', assignee: 'Marcus Reyes', dueDate: isoDate(now, 2), cost: 220,
    }),
    order(4, {
      property: 'Cedar Court Apartments', title: 'Annual smoke detector check', status: 'scheduled',
      priority: 'low', assignee: 'Priya Raman', dueDate: isoDate(now, 14),
    }),
    order(5, {
      property: 'Cedar Court Apartments', title: 'HVAC filter replacement — building 1', vendor: 'ClearView HVAC',
      status: 'in-progress', priority: 'medium', assignee: 'Marcus Reyes', dueDate: isoDate(now, -2), cost: 340,
    }),
    order(6, {
      property: 'Cedar Court Apartments', title: 'Gate keypad repaired', vendor: 'BrightSpark Electric',
      status: 'completed', priority: 'medium', assignee: 'Marcus Reyes', cost: 180, updatedAt: isoStamp(now, -3),
    }),
  ];

  return {
    company: SHOWCASE_COMPANY,
    profile: { company: SHOWCASE_COMPANY, portfolioSize: 'small', focus: 'stability', configuredAt: now.toISOString() },
    team,
    portfolio: { properties, tenants, vendors },
    workOrders,
  };
}

// Sets owners, status, priority, due dates, dependencies, notes and custom fields on
// the live config departments (mutating them, like the app's own Auto-Assign does).
export function applyShowcaseTasks(departments, employees, now = new Date()) {
  const workload = new Map(employees.map(emp => [emp.name, 0]));
  const byId = new Map(departments.map(dept => [dept.id, dept]));

  departments.forEach((dept, deptIdx) => {
    const pool = employees.filter(emp => emp.affinities.includes(dept.id));
    const uncovered = UNCOVERED_DEPARTMENTS.includes(dept.id) || pool.length === 0;

    dept.tasks.forEach((task, taskIdx) => {
      task.dueDate = null;
      task.blockedBy = null;
      task.notes = null;
      task.customFields = null;

      if (uncovered) {
        task.owner = 'UNOWNED';
        task.status = 'todo';
        task.priority = 'medium';
        return;
      }

      // Least-loaded person among those with affinity — same idea as the app's Auto-Assign.
      const owner = [...pool].sort((a, b) => workload.get(a.name) - workload.get(b.name))[0];
      workload.set(owner.name, workload.get(owner.name) + 1);
      task.owner = owner.name;

      // Deterministic spread so the same demo always looks the same.
      const h = (deptIdx * 31 + taskIdx * 17) % 20;
      task.status = h < 5 ? 'done' : h < 10 ? 'in-progress' : h === 10 ? 'blocked' : 'todo';
      task.priority = h % 5 === 0 ? 'high' : h % 7 === 0 ? 'low' : 'medium';
      if (task.status !== 'done' && h % 4 === 0) task.dueDate = isoDate(now, ((h * 7) % 34) - 12);
    });
  });

  const link = (deptId, blockedIdx, blockerIdx) => {
    const tasks = byId.get(deptId)?.tasks;
    const blocked = tasks?.[blockedIdx];
    const blocker = tasks?.[blockerIdx];
    if (!blocked || !blocker) return;
    blocker.status = blocker.status === 'done' ? 'in-progress' : blocker.status; // a dependency only matters while it is open
    blocked.status = 'blocked';
    blocked.blockedBy = { deptId, taskId: blocker.id, configName: blocker._configName || blocker.name, name: blocker.name };
  };

  // Hand-placed storylines.
  link('maintenance', 1, 0);
  link('unit-turns', 2, 1);
  link('delinquency', 2, 1);

  const maintenance = byId.get('maintenance')?.tasks;
  if (maintenance?.[0]) {
    maintenance[0].priority = 'high';
    maintenance[0].notes = 'Confirm the after-hours dispatch tree with Ace Plumbing before month end.';
    maintenance[0].customFields = { 'Emergency vendor SLA': '4 hours', 'After-hours line': '(555) 010-4400' };
  }
  const leasing = byId.get('leasing')?.tasks;
  if (leasing?.[0]) {
    leasing[0].status = 'in-progress';
    leasing[0].notes = 'Syndication is paused until the owner approves the new photos.';
  }
  const delinquency = byId.get('delinquency')?.tasks;
  if (delinquency?.[1]) {
    delinquency[1].priority = 'high';
    delinquency[1].dueDate = isoDate(now, -3); // visibly overdue
    if (delinquency[1].status === 'done') delinquency[1].status = 'in-progress';
  }
}
