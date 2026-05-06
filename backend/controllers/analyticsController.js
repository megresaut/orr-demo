// controllers/analyticsController.js — burn-up, utilization, portfolio summary.
const dbPromise = require('../db');

function rateLookup(rates) {
  const byName = new Map();
  for (const r of rates) if (r.name) byName.set(r.name.toLowerCase(), Number(r.rate));
  const fallback = rates[0]?.rate ? Number(rates[0].rate) : 0;
  return name => byName.get(String(name || '').toLowerCase()) ?? fallback;
}

exports.projectAnalytics = async (req, res, next) => {
  try {
    const db = await dbPromise;
    const projRes = await db.query(`SELECT * FROM projects WHERE id = $1 AND org_id = $2`,
      [req.params.id, req.orgId]);
    const project = projRes.rows[0];
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const ratesRes = await db.query(`SELECT role, name, rate FROM project_rates WHERE project_id = $1`,
      [req.params.id]);
    const tasksRes = await db.query(`SELECT * FROM project_tasks WHERE project_id = $1`,
      [req.params.id]);
    const entriesRes = await db.query(
      `SELECT entry_date, hours, resource_name, task_code FROM time_entries
        WHERE project_id = $1 ORDER BY entry_date`, [req.params.id]);

    const lookupRate = rateLookup(ratesRes.rows);
    const tasksByCode = new Map();
    for (const t of tasksRes.rows) tasksByCode.set(t.task_code, t);

    let actualHours = 0;
    let actualCost = 0;
    const byMonth = new Map(); // 'YYYY-MM' -> { hours, cost }
    const byResource = new Map(); // resource -> { hours, cost }

    for (const e of entriesRes.rows) {
      const taskRate = e.task_code && tasksByCode.get(e.task_code)?.billing_rate
        ? Number(tasksByCode.get(e.task_code).billing_rate)
        : lookupRate(e.resource_name);
      const cost = Number(e.hours) * taskRate;
      actualHours += Number(e.hours);
      actualCost += cost;

      const ym = String(e.entry_date).slice(0, 7);
      if (!byMonth.has(ym)) byMonth.set(ym, { hours: 0, cost: 0 });
      const m = byMonth.get(ym); m.hours += Number(e.hours); m.cost += cost;

      if (!byResource.has(e.resource_name)) byResource.set(e.resource_name, { hours: 0, cost: 0 });
      const r = byResource.get(e.resource_name); r.hours += Number(e.hours); r.cost += cost;
    }

    const budgetHours = tasksRes.rows.reduce((s, t) => s + Number(t.budget_hours || 0), 0);
    const budgetCost = Number(project.contract_amount || 0);

    // Earned value: hours actually completed × budgeted rate (approximation)
    const earnedValue = tasksRes.rows.reduce((s, t) => {
      const billed = Number(t.billed_hours || 0);
      const rate = Number(t.billing_rate || 0);
      return s + billed * rate;
    }, 0);

    // Burn-up: cumulative monthly series
    const months = Array.from(byMonth.keys()).sort();
    let cumHours = 0, cumCost = 0;
    const burn = months.map(m => {
      const v = byMonth.get(m);
      cumHours += v.hours; cumCost += v.cost;
      return { month: m, hours: cumHours, actual_cost: Math.round(cumCost * 100) / 100 };
    });

    res.json({
      project: { id: project.id, name: project.name, code: project.code },
      kpis: {
        budget_hours: budgetHours,
        actual_hours: Math.round(actualHours * 100) / 100,
        remaining_hours: Math.round((budgetHours - actualHours) * 100) / 100,
        budget_cost: budgetCost,
        actual_cost: Math.round(actualCost * 100) / 100,
        earned_value: Math.round(earnedValue * 100) / 100,
        variance_at_completion: Math.round((budgetCost - actualCost) * 100) / 100,
        cpi: actualCost > 0 ? Math.round((earnedValue / actualCost) * 1000) / 1000 : null,
        spi: budgetHours > 0 ? Math.round((actualHours / budgetHours) * 1000) / 1000 : null,
      },
      burn_up: burn,
      by_resource: Array.from(byResource.entries()).map(([name, v]) => ({
        resource_name: name,
        hours: Math.round(v.hours * 100) / 100,
        cost: Math.round(v.cost * 100) / 100,
      })),
    });
  } catch (err) { next(err); }
};

exports.portfolio = async (req, res, next) => {
  try {
    const db = await dbPromise;
    const { rows } = await db.query(
      `SELECT p.id, p.name, p.code, p.contract_amount, p.total_services_to_date,
              (SELECT COALESCE(SUM(hours),0) FROM time_entries t WHERE t.project_id = p.id) AS hours,
              (SELECT COALESCE(SUM(total),0) FROM invoices i WHERE i.project_id = p.id AND i.status='paid') AS paid,
              (SELECT COALESCE(SUM(total),0) FROM invoices i WHERE i.project_id = p.id AND i.status<>'paid') AS unpaid
         FROM projects p WHERE p.org_id = $1 ORDER BY p.created_at DESC`,
      [req.orgId]
    );
    const totals = rows.reduce((acc, p) => {
      acc.contract += Number(p.contract_amount || 0);
      acc.delivered += Number(p.total_services_to_date || 0);
      acc.hours += Number(p.hours || 0);
      acc.paid += Number(p.paid || 0);
      acc.unpaid += Number(p.unpaid || 0);
      return acc;
    }, { contract: 0, delivered: 0, hours: 0, paid: 0, unpaid: 0 });
    res.json({ projects: rows, totals });
  } catch (err) { next(err); }
};
