import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Users,
  Megaphone,
  Settings,
  FileText,
  MessageSquare,
  BarChart3,
  Activity,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/leads', icon: Users, label: 'Dormant Leads' },
  { to: '/campaigns', icon: Megaphone, label: 'Campaigns' },
  { to: '/rules', icon: FileText, label: 'Rules' },
  { to: '/reviews', icon: MessageSquare, label: 'Review Queue' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/activity', icon: Activity, label: 'Activity Log' },
];

const bottomNavItems = [{ to: '/settings', icon: Settings, label: 'Settings' }];

interface NavItemProps {
  to: string;
  icon: React.ElementType;
  label: string;
  isCollapsed: boolean;
}

function NavItem({ to, icon: Icon, label, isCollapsed }: NavItemProps) {
  const location = useLocation();
  const isActive = location.pathname === to || location.pathname.startsWith(`${to}/`);

  const content = (
    <NavLink
      to={to}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        isCollapsed && 'justify-center px-2'
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      {!isCollapsed && <span>{label}</span>}
    </NavLink>
  );

  if (isCollapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right" className="flex items-center gap-4">
          {label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

export function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  return (
    <TooltipProvider>
      <div
        className={cn(
          'flex h-full flex-col border-r bg-background transition-all duration-300',
          isCollapsed ? 'w-[60px]' : 'w-[240px]'
        )}
      >
        {/* Header */}
        <div
          className={cn(
            'flex h-16 items-center border-b px-4',
            isCollapsed ? 'justify-center' : 'justify-between'
          )}
        >
          {!isCollapsed && (
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-hubspot-orange flex items-center justify-center">
                <span className="text-sm font-bold text-white">DL</span>
              </div>
              <span className="font-semibold text-foreground">Dormant Leads</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="h-8 w-8 shrink-0"
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 px-3 py-4">
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => (
              <NavItem key={item.to} {...item} isCollapsed={isCollapsed} />
            ))}
          </nav>
        </ScrollArea>

        {/* Bottom navigation */}
        <div className="px-3 py-4">
          <Separator className="mb-4" />
          <nav className="flex flex-col gap-1">
            {bottomNavItems.map((item) => (
              <NavItem key={item.to} {...item} isCollapsed={isCollapsed} />
            ))}
          </nav>
        </div>
      </div>
    </TooltipProvider>
  );
}
