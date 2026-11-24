import { ReactNode, useContext, useState } from "react";

// components
import { AdminIconButton, AdminView, Loading } from "@/components";

// context
import { GlobalStateContext } from "@context/GlobalContext";

/**
 * Drawer shell matching the mockups: title, then (admins, Fishing drawer only) the standard
 * AdminIconButton gear. No in-app close button: the drawer has its own. Admin Settings replaces the body. No How to Play screen (Lina 11/20).
 * Layout change approved by Lina 11/20; AdminIconButton itself is unchanged.
 */
export const PageContainer = ({
  children,
  isLoading,
  headerText,
  headerImage,
  showAdminGear = false,
}: {
  children: ReactNode;
  isLoading: boolean;
  headerText?: string;
  /** Title art shown in place of `headerText` (`alt` must match the words in the image). */
  headerImage?: { src: string; alt: string };
  showAdminGear?: boolean;
}) => {
  const { error, isAdmin } = useContext(GlobalStateContext);
  const [showSettings, setShowSettings] = useState(false);

  if (isLoading) return <Loading />;

  return (
    <main className="ff-page">
      <header className="ff-header">
        <h1 className="ff-header__title">
          {showSettings ? (
            "Admin Settings"
          ) : headerImage ? (
            <img className="ff-header__image" src={headerImage.src} alt={headerImage.alt} />
          ) : (
            headerText
          )}
        </h1>
        {isAdmin && showAdminGear && (
          <div className="ff-header__actions">
            <AdminIconButton setShowSettings={() => setShowSettings(!showSettings)} showSettings={showSettings} />
          </div>
        )}
      </header>
      {showSettings ? <AdminView /> : children}
      {error && (
        <p className="ff-error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
};

export default PageContainer;
