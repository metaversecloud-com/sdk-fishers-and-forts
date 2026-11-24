/** World toasts for fort milestones (spec §5.7) — fired only by the request whose write crossed them. */
const MILESTONE_TEXT: Record<string, string> = {
  foundation: "The Snow Fort's foundation is finished! Come see it.",
  walls: "The Snow Fort's walls are finished! Come see it.",
  towers: "The Snow Fort's towers are finished! Come see it.",
};

export const fireMilestoneToasts = (world: any, milestones: string[], completed: boolean) => {
  const fire = (text: string) =>
    world
      .fireToast({ groupId: "snowFort", title: "Snow Fort", text })
      .catch((error: unknown) => console.error("fireMilestoneToasts failed", error));

  for (const key of milestones) if (MILESTONE_TEXT[key]) fire(MILESTONE_TEXT[key]);
  if (completed) fire("The Snow Fort is complete! Thanks to everyone who fished.");
};
