import { useAuth } from '@/features/auth/context/AuthContext';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Bell, LogOut, User, ExternalLink } from 'lucide-react';
import { getInitials } from '@/lib/utils';
import { useReviewStats } from '@/api/hooks/useReviews';
import { Badge } from '@/components/ui/badge';

export function Header() {
  const { companyName, portalId, logout } = useAuth();
  const { data: reviewStats } = useReviewStats();

  const pendingReviews = reviewStats?.pending ?? 0;

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6">
      <div className="flex items-center gap-4">
        {/* Breadcrumb or page title could go here */}
      </div>

      <div className="flex items-center gap-4">
        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {pendingReviews > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 h-5 w-5 rounded-full p-0 text-[10px] flex items-center justify-center"
            >
              {pendingReviews > 99 ? '99+' : pendingReviews}
            </Badge>
          )}
        </Button>

        {/* HubSpot portal link */}
        {portalId && (
          <Button variant="ghost" size="sm" asChild>
            <a
              href={`https://app.hubspot.com/contacts/${portalId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1"
            >
              <span className="text-sm text-muted-foreground">Open HubSpot</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </Button>
        )}

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 w-9 rounded-full">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {companyName ? getInitials(companyName) : 'HS'}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">
                  {companyName || 'HubSpot Account'}
                </p>
                <p className="text-xs leading-none text-muted-foreground">
                  Portal ID: {portalId}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a
                href={`https://app.hubspot.com/settings/${portalId}/users`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2"
              >
                <User className="h-4 w-4" />
                <span>HubSpot Settings</span>
                <ExternalLink className="ml-auto h-3 w-3" />
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Disconnect Account</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
