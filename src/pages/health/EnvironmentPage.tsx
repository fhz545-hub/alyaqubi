import HealthRegisterPage from "@/components/health/HealthRegisterPage";
import { HEALTH_REGISTERS } from "@/utils/healthRegisters";
export default function EnvironmentPage() { return <HealthRegisterPage config={HEALTH_REGISTERS["environment"]} />; }