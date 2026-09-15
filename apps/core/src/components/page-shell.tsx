interface PageShellProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export const PageShell: React.FC<PageShellProps> = ({ title, description, actions, children }) => {
  return (
    <div className="min-h-dvh bg-background">
      <div className="page-container px-4 py-10 sm:py-14">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-balance font-bold text-2xl tracking-tight sm:text-3xl">{title}</h1>
            {description ? <p className="mt-1.5 text-balance text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </header>
        {children}
      </div>
    </div>
  );
};
