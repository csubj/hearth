import type { ProjectComponent } from "@/db/schema";

function componentLineCost(component: Pick<ProjectComponent, "quantity" | "unitCostCents">): number {
  return component.quantity * component.unitCostCents;
}

export function sumComponentCosts(
  components: Pick<ProjectComponent, "quantity" | "unitCostCents">[],
): number {
  return components.reduce((sum, component) => sum + componentLineCost(component), 0);
}

export function sumAcquiredCosts(
  components: Pick<ProjectComponent, "quantity" | "unitCostCents" | "acquired">[],
): number {
  return components
    .filter((component) => component.acquired)
    .reduce((sum, component) => sum + componentLineCost(component), 0);
}

export function countAcquired(
  components: Pick<ProjectComponent, "acquired">[],
): { acquiredCount: number; componentCount: number } {
  return {
    acquiredCount: components.filter((component) => component.acquired).length,
    componentCount: components.length,
  };
}

export function componentRollups(components: ProjectComponent[]) {
  const estimatedCostCents = sumComponentCosts(components);
  const acquiredCostCents = sumAcquiredCosts(components);
  const { acquiredCount, componentCount } = countAcquired(components);
  return {
    estimatedCostCents,
    acquiredCostCents,
    remainingCostCents: estimatedCostCents - acquiredCostCents,
    acquiredCount,
    componentCount,
  };
}
