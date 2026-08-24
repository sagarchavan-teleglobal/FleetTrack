import { Inbox } from "lucide-react";

interface EmptyStateProps {
  title?: string;
  message?: string;
}

export default function EmptyState({
  title = "No data",
  message = "No records found.",
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <Inbox className="h-8 w-8 text-gray-300 dark:text-gray-600" />
      <h3 className="mt-3 text-sm font-medium text-gray-600 dark:text-gray-400">{title}</h3>
      <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">{message}</p>
    </div>
  );
}
