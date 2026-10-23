import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { t } from "i18next"

import { cn } from "src/lib/utils"

const restorePointerEvents = () => {
  setTimeout(() => {
    document.body.style.removeProperty("pointer-events");
    document.body.style.removeProperty("overflow");
  }, 10);
  setTimeout(() => {
    document.body.style.removeProperty("pointer-events");
    document.body.style.removeProperty("overflow");
  }, 250);
  setTimeout(() => {
    document.body.style.removeProperty("pointer-events");
    document.body.style.removeProperty("overflow");
  }, 500);
};

const Dialog = ({ onOpenChange, ...props }) => {
  const handleOpenChange = React.useCallback((open) => {
    if (!open) {
      restorePointerEvents();
    }
    onOpenChange?.(open);
  }, [onOpenChange]);

  return <DialogPrimitive.Root onOpenChange={handleOpenChange} {...props} />;
};

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef(({ className, style, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    style={style}
    className={cn(
      "fixed inset-0 z-[1000] bg-[#0D1B3E]/50 backdrop-blur-sm dark:bg-[#0D1B3E]/70 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props} />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef(({ 
  className, 
  children, 
  hideCloseButton, 
  staticBackdrop = false, 
  onPointerDownOutside, 
  onEscapeKeyDown, 
  onInteractOutside, 
  ...props 
}, ref) => {
  const [shake, setShake] = React.useState(false);

  React.useEffect(() => {
    return () => {
      restorePointerEvents();
    };
  }, []);

  const triggerAnimation = () => {
    setShake(false);
    setTimeout(() => setShake(true), 10);
    setTimeout(() => setShake(false), 260);
  };

  const handlePointerDownOutside = (e) => {
    if (document.querySelector('.react-joyride__overlay')) {
      e.preventDefault();
      return;
    }

    if (staticBackdrop) {
      e.preventDefault();
      triggerAnimation();
    } else if (onPointerDownOutside) {
      onPointerDownOutside(e);
      if (e.defaultPrevented && staticBackdrop) triggerAnimation();
    }
  };

  const handleEscapeKeyDown = (e) => {
    if (staticBackdrop) {
      e.preventDefault();
      triggerAnimation();
    } else if (onEscapeKeyDown) {
      onEscapeKeyDown(e);
      if (e.defaultPrevented && staticBackdrop) triggerAnimation();
    }
  };

  const handleInteractOutside = (e) => {
    if (document.querySelector('.react-joyride__overlay')) {
      e.preventDefault();
      return;
    }

    if (staticBackdrop) {
      e.preventDefault();
      triggerAnimation();
    }
  };

  const zIndexVal = props?.style?.zIndex;
  const overlayStyle = zIndexVal ? { zIndex: zIndexVal - 1 } : undefined;

  return (
    <DialogPortal>
      <DialogOverlay style={overlayStyle} />
      <DialogPrimitive.Content
        ref={ref}
        onPointerDownOutside={handlePointerDownOutside}
        onEscapeKeyDown={handleEscapeKeyDown}
        onInteractOutside={handleInteractOutside}
        className={cn(
          "fixed left-[50%] top-[50%] z-[1000] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border-0 bg-[#f1f5f9] dark:bg-[#0f172a] p-6 shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-[20px]",
          shake && "modal-shake-active",
          className
        )}
        {...props}>
        {children}
        {!hideCloseButton && (
          <DialogPrimitive.Close
            className="absolute right-4 top-4 rounded-full border border-gray-300 dark:border-gray-600 p-1.5 opacity-70 ring-offset-background transition-all text-slate-800 dark:text-slate-200 hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
            <X className="h-5 w-5" />
            <span className="sr-only">{t("Close")}</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}) => (
  <div
    className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
    {...props} />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props} />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props} />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props} />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
