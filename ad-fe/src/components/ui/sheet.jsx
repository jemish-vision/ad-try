import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { cva } from "class-variance-authority";
import { X } from "lucide-react"
import { t } from "i18next"

import { cn } from "src/lib/utils"

const Sheet = SheetPrimitive.Root

const SheetTrigger = SheetPrimitive.Trigger

const SheetClose = SheetPrimitive.Close

const SheetPortal = SheetPrimitive.Portal

const SheetOverlay = React.forwardRef(({ className, style, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    style={{ top: 0, right: 0, bottom: 0, left: 0, zIndex: 99999, backgroundColor: "rgba(0, 0, 0, 0.4)", ...style }}
    {...props}
    ref={ref} />
))
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName

const sheetVariants = cva(
  "fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=open]:animate-in data-[state=closed]:animate-out",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  }
)

const sideStyles = {
  top: { top: 0, left: 0, right: 0, width: "100%", zIndex: 99999 },
  bottom: { bottom: 0, left: 0, right: 0, width: "100%", zIndex: 99999 },
  left: { top: 0, bottom: 0, left: 0, height: "100%", zIndex: 99999 },
  right: { top: 0, bottom: 0, right: 0, height: "100%", zIndex: 99999 },
};

const SheetContent = React.forwardRef(({ side = "right", className, overlayClassName, overlayStyle, children, style, hideCloseButton, onPointerDownOutside, ...props }, ref) => {
  const handlePointerDownOutside = (e) => {
    if (document.querySelector('.react-joyride__overlay')) {
      e.preventDefault();
      return;
    }
    if (onPointerDownOutside) {
      onPointerDownOutside(e);
    }
  };

  return (
    <SheetPortal>
      <SheetOverlay className={overlayClassName} style={overlayStyle} />
      <SheetPrimitive.Content 
        ref={ref} 
        onPointerDownOutside={handlePointerDownOutside}
        className={cn(sheetVariants({ side }), className)} 
        style={{ ...sideStyles[side], ...style }} 
        {...props}
      >
        {!hideCloseButton && (
          <SheetPrimitive.Close
            id={props.id ? `${props.id}-close` : undefined}
            className="absolute right-4 top-4 rounded-full p-1 opacity-70 transition-opacity hover:opacity-100 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none disabled:pointer-events-none">
            <X className="h-5 w-5 dark:text-slate-300" />
            <span className="sr-only">{t("Close")}</span>
          </SheetPrimitive.Close>
        )}
        {children}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
})
SheetContent.displayName = SheetPrimitive.Content.displayName

const SheetHeader = ({
  className,
  ...props
}) => (
  <div
    className={cn("flex flex-col space-y-2 text-center sm:text-left", className)}
    {...props} />
)
SheetHeader.displayName = "SheetHeader"

const SheetFooter = ({
  className,
  ...props
}) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props} />
)
SheetFooter.displayName = "SheetFooter"

const SheetTitle = React.forwardRef(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-foreground", className)}
    {...props} />
))
SheetTitle.displayName = SheetPrimitive.Title.displayName

const SheetDescription = React.forwardRef(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props} />
))
SheetDescription.displayName = SheetPrimitive.Description.displayName

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
