export function FormSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-bold text-brand-navy">{title}</h3>
        {subtitle ? (
          <p className="text-sm text-brand-gray mt-1">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}