import { createFileRoute } from "@tanstack/react-router";
import { ProInvite } from "@/components/hdar/pro-invite";

export const Route = createFileRoute("/pro_/invitation/$token")({
  head: () => ({ meta: [{ title: "Votre fiche hdar pro est prête" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: Invite,
});

function Invite() {
  const { token } = Route.useParams();
  return <ProInvite token={token} />;
}
