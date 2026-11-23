import { NxBrandLoader } from '../components/ui/nx-loading';

export default function AppLoading() {
  return (
    <NxBrandLoader
      fullScreen
      label="Nexoclip Studio"
      sublabel="Preparing your creative workspace"
    />
  );
}
