import { PlantWorkspace } from "@/components/workspace/plant-workspace";

type PageProps = {
  params: Promise<{ seedCode: string }>;
};

export default async function TripPage({ params }: PageProps) {
  const { seedCode } = await params;
  return <PlantWorkspace seedCode={seedCode.toUpperCase()} />;
}
