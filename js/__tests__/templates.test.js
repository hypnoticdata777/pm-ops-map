import { describe, test, expect } from 'vitest';
import { ROLE_TEMPLATES, SOP_TEMPLATES, buildDemoWorkspace } from '../templates.js';

describe('beginner templates', () => {
  test('role templates include expected starter shapes', () => {
    expect(Object.keys(ROLE_TEMPLATES)).toEqual(
      expect.arrayContaining(['solo', 'twoPerson', 'maintenanceHeavy', 'leasingHeavy'])
    );
    Object.values(ROLE_TEMPLATES).forEach(template => {
      expect(template.employees.length).toBeGreaterThan(0);
      template.employees.forEach(emp => {
        expect(emp.name).toBeTruthy();
        expect(emp.hex).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(Array.isArray(emp.affinities)).toBe(true);
      });
    });
  });

  test('SOP template library has actionable steps', () => {
    expect(SOP_TEMPLATES.length).toBeGreaterThanOrEqual(3);
    SOP_TEMPLATES.forEach(template => {
      expect(template.title).toBeTruthy();
      expect(template.cadence).toBeTruthy();
      expect(template.steps.length).toBeGreaterThan(1);
    });
  });

  test('demo workspace includes portfolio and first work order', () => {
    const demo = buildDemoWorkspace(new Date('2026-05-19T00:00:00.000Z'));
    expect(demo.company).toContain('Demo');
    expect(demo.portfolio.properties).toHaveLength(1);
    expect(demo.portfolio.tenants).toHaveLength(1);
    expect(demo.portfolio.vendors).toHaveLength(1);
    expect(demo.workOrders).toHaveLength(1);
    expect(demo.workOrders[0].assignee).toBe('Maintenance Coordinator');
  });
});
