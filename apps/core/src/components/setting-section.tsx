interface SettingSectionProps {
  title: React.ReactNode;
  icon?: React.ReactNode;
  footer?: React.ReactNode;
  extra?: React.ReactNode;
  children: React.ReactNode;
}

export const SettingSection: React.FC<SettingSectionProps> = ({ title, icon, footer, extra, children }) => {
  return (
    <section>
      <div className="sticky top-0 z-10 bg-background py-2">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium text-sm">{title}</span>
          {extra}
        </div>
      </div>
      {children}

      {footer ? <div className="mt-1 text-muted-foreground text-xs">{footer}</div> : null}
    </section>
  );
};
