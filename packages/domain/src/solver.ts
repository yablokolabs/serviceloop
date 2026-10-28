// Deterministic coupled solver: bay interval plus pickup-driver interval plus travel.
// Only this module mints candidate IDs. Model output never enters capacity checks.

export interface BayWindow {
  id: string;
  freeFromMin: number;
  freeToMin: number;
}
export interface DriverWindow {
  id: string;
  freeFromMin: number;
  freeToMin: number;
}
export interface WorkshopConfig {
  timezone: string;
  date: string;
  openMin: number;
  closeMin: number;
  serviceMins: number;
  travelMins: number;
  bays: BayWindow[];
  drivers: DriverWindow[];
}
export interface SlotRequest {
  serviceStartBeforeMin?: number;
  serviceStartAtOrAfterMin?: number;
  pickupRequired: boolean;
  pickupAtMin?: number;
}
export interface Candidate {
  id: string;
  serviceStartMin: number;
  pickupMin?: number;
  bayId: string;
  driverId?: string;
  violatedPreference: string;
}
export interface SolverOutput {
  candidates: Candidate[];
  reasons: string[];
  compromises: Candidate[];
}

export function findSlots(w: WorkshopConfig, req: SlotRequest): SolverOutput {
  const candidates: Candidate[] = [];
  const reasons: string[] = [];

  // A closed bay is a capacity fact, not a crash: report no candidates.
  if (w.bays.length === 0) {
    reasons.push('no service bay is available');
    return { candidates, reasons, compromises: [] };
  }

  if (!req.pickupRequired) {
    for (const bay of w.bays) {
      const start = Math.max(bay.freeFromMin, w.openMin, req.serviceStartAtOrAfterMin ?? 0);
      if (start + w.serviceMins > Math.min(bay.freeToMin, w.closeMin)) continue;
      if (req.serviceStartBeforeMin !== undefined && start >= req.serviceStartBeforeMin) continue;
      candidates.push({
        id: `cand-${w.date}-${start}-${bay.id}`,
        serviceStartMin: start,
        bayId: bay.id,
        violatedPreference: '',
      });
    }
    if (candidates.length === 0) reasons.push('no bay window satisfies the requested service time');
    return { candidates, reasons, compromises: [] };
  }

  const before = req.serviceStartBeforeMin;
  for (const driver of w.drivers) {
    for (const bay of w.bays) {
      // A confirmed pickup time is a hard constraint, not a hint: the
      // pickup happens then, or there is no candidate.
      const pickupMin = req.pickupAtMin ?? Math.max(driver.freeFromMin, w.openMin);
      const serviceStartMin = pickupMin + w.travelMins;
      const bayOk = serviceStartMin >= bay.freeFromMin && serviceStartMin + w.serviceMins <= bay.freeToMin;
      const driverOk = pickupMin >= driver.freeFromMin && pickupMin + w.travelMins <= driver.freeToMin;
      const timeOk =
        (before === undefined || serviceStartMin < before) &&
        (req.serviceStartAtOrAfterMin === undefined || serviceStartMin >= req.serviceStartAtOrAfterMin);
      if (bayOk && driverOk && timeOk) {
        candidates.push({
          id: `cand-${w.date}-${serviceStartMin}-${bay.id}-${driver.id}`,
          serviceStartMin,
          pickupMin,
          bayId: bay.id,
          driverId: driver.id,
          violatedPreference: '',
        });
      }
    }
  }

  if (candidates.length > 0) return { candidates, reasons, compromises: [] };

  const earliestDriver = Math.min(...w.drivers.map((d) => d.freeFromMin));
  const earliestService = earliestDriver + w.travelMins;
  reasons.push(
    `no bay window satisfies the requested service time after required pickup plus travel: earliest service start is ${fmt(earliestService)}`,
    `pickup driver free only from ${fmt(earliestDriver)}, bay free from ${fmt(Math.min(...w.bays.map((b) => b.freeFromMin)))}`,
  );
  const compromises: Candidate[] = [
    {
      id: `comp-${w.date}-${earliestService}-relax-before`,
      serviceStartMin: earliestService,
      pickupMin: earliestDriver,
      bayId: w.bays[0].id,
      driverId: w.drivers[0].id,
      violatedPreference: 'service before requested cutoff',
    },
    {
      id: `comp-${w.date}-nopickup`,
      serviceStartMin: Math.max(w.bays[0].freeFromMin, w.openMin),
      bayId: w.bays[0].id,
      violatedPreference: 'pickup required',
    },
  ];
  return { candidates, reasons, compromises };
}

function fmt(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}
