import { Spinner } from "@my-better-t-app/ui/components/spinner";

export default function Loader() {
  return (
    <div className="flex h-full items-center justify-center pt-16" role="status" aria-live="polite">
      <Spinner className="app-spinner size-5" aria-hidden="true" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
