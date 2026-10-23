import { useTranslation } from "react-i18next";
import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import { t } from "i18next";
import { useContext, useEffect, useState } from "react";

import Filter from "../../../helper/filter/Filter";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import { ProfileContext } from "../../../helper/usecontext/useContext";

/* FULL CALENDAR */
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import HolidayModal from "./Holidays/HolidayModal";
import { ApiCreateHoliday, ApiDeleteHoliday, ApiHolidayListing, ApiSaveSpecialDaysReminder, ApiUpdateHoliday } from "../../../api-wrapper/holidays/ApiHolidays";
import { Toast } from "../../../helper/links/Link";
import moment from "moment";
import { CustomModal } from "../../../helper/modal/CustomModal";

const Holidays = () => {
  const { t } = useTranslation();
  const { profileId, selectedAdType } = useContext(ProfileContext);
  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const canViewHoliday = PermissionCheck(SYSTEM_PAGES.HOLIDAY_SPECIAL_DAYS, PAGE_ACTIONS.VIEW_ONLY);
  const canCreateHoliday = PermissionCheck(SYSTEM_PAGES.HOLIDAY_SPECIAL_DAYS, PAGE_ACTIONS.CREATE);
  const canUpdateHoliday = PermissionCheck(SYSTEM_PAGES.HOLIDAY_SPECIAL_DAYS, PAGE_ACTIONS.UPDATE);
  const canRemoveHoliday = PermissionCheck(SYSTEM_PAGES.HOLIDAY_SPECIAL_DAYS, PAGE_ACTIONS.REMOVE);

  const [events, setEvents] = useState([]);
  const [openModal, setOpenModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedRange, setSelectedRange] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const ApiListing = async () => {
    await ApiHolidayListing({ profileId: profileId?.value })
      .then((res) => {
        if (res.isSuccess) {
          const formatted = res.data.map((h) => ({
            id: h._id,
            title: h.name,
            start: h.startDate,
            end: moment(h?.endDate).add(1, "days").format("YYYY-MM-DD"),
            backgroundColor: h.color,
            editable: !h.isOwnerEvent,
            startEditable: !h.isOwnerEvent,
            durationEditable: !h.isOwnerEvent,
            extendedProps: {
              reminders: h.reminderDates,
              protection: { enabled: h.protectionEnable, mode: h.protectionAction, reduceBidPercent: h.reduceBidPercent },
            },
          }));
          setEvents(formatted);
        }
        else Toast.error(res.message)
      })
      .catch(() => Toast.error(t("Something went wrong")));
  };

  useEffect(() => {
    if (profileId?.value && selectedAdType) ApiListing();
  }, [profileId?.value, selectedAdType]);

  /* ---------------- EVENT CLICK ---------------- */
  const handleEventClick = (info) => {
    if (!canViewHoliday) return;

    const findEvent = events?.find((ev) => ev?.id === info?.event?._def?.publicId)

    // if (findEvent && !findEvent?.editable) {
    //   return alert("You don’t have permission to edit this Super Admin event.")
    // }

    if (findEvent) {
      setSelectedEvent({ ...findEvent, isSuperAdminEvent: !findEvent.editable, end: moment(findEvent?.end).subtract(1, "days").format("YYYY-MM-DD") });
      setOpenModal(true);
    }
  };

  /* ---------------- EVENT DATE SELECT ---------------- */
  const handleDateSelect = (selectInfo) => {
    if (!canCreateHoliday) return;

    const start = selectInfo.startStr;
    const end = moment(selectInfo.endStr).subtract(1, "days").format("YYYY-MM-DD");

    setSelectedRange({ start, end });
    setSelectedEvent(null);
    setOpenModal(true);
  };

  /* ---------------- EVENT SAVE ---------------- */
  const handleSave = async (payload) => {
    try {
      const apiPayload = { profileId: profileId?.value, ...payload };
      let res;

      if (payload.id) {
        res = await ApiUpdateHoliday({ ...apiPayload, id: payload.id });
      } else {
        res = await ApiCreateHoliday(apiPayload);
      }

      if (res?.isSuccess) {
        ApiListing();
        setOpenModal(false);
      }
      else Toast.error(res.message);
    } catch (error) {
      Toast.error(error.message);
    }
  };

  /* ---------------- EVENT DELETE ---------------- */
  const handleDelete = (id) => {
    setDeleteConfirm(id);
  };

  const executeDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const res = await ApiDeleteHoliday({ profileId: profileId?.value, id: deleteConfirm });
      if (res?.isSuccess) {
        ApiListing();
        setOpenModal(false);
      } else Toast.error(res.message);
    } catch (error) {
      Toast.error(error.message);
    } finally {
      setDeleteConfirm(null);
    }
  };

  const handleSuperAdminEventReminderSave = async (payload) => {
    try {
      const apiPayload = { profileId: profileId?.value, ...payload };
      const res = await ApiSaveSpecialDaysReminder(apiPayload);
      if (res?.isSuccess) {
        ApiListing();
        setOpenModal(false);
      }
      else Toast.error(res.message);
    } catch (error) {
      Toast.error(error.message);
    }
  }

  return (
    <>
      <style>{`
        /* Modern Card-Based Grid Calendar Styling */
        #custom-holiday-calendar {
          font-family: inherit;
        }
        
        /* Remove default table borders */
        #custom-holiday-calendar .fc-theme-standard td,
        #custom-holiday-calendar .fc-theme-standard th,
        #custom-holiday-calendar .fc-scrollgrid,
        #custom-holiday-calendar .fc-scroller {
          border: none !important;
        }

        /* Day grid cell layout as modern cards with gap spacing */
        #custom-holiday-calendar .fc-daygrid-day {
          padding: 6px !important;
          background: transparent !important;
        }

        #custom-holiday-calendar .fc-daygrid-day-frame {
          background: ${isDark ? "rgba(30, 41, 59, 0.4)" : "#ffffff"} !important;
          border: 1px solid ${isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(2, 70, 139, 0.08)"} !important;
          border-radius: 12px !important;
          min-height: 90px !important;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.03), 0 2px 4px -1px rgba(0, 0, 0, 0.02) !important;
          overflow: hidden;
          position: relative;
        }

        @media (max-width: 767px) {
          #custom-holiday-calendar .fc-daygrid-day-frame {
            min-height: auto !important;
            aspect-ratio: 1 / 1 !important;
          }
        }

        /* Interactive Hover Lifts */
        #custom-holiday-calendar .fc-daygrid-day:not(.fc-day-other):hover .fc-daygrid-day-frame {
          transform: translateY(-3px) scale(1.02);
          border-color: ${isDark ? "rgba(59, 130, 246, 0.6)" : "rgba(26, 159, 212, 0.6)"} !important;
          box-shadow: 0 12px 20px -8px ${isDark ? "rgba(0, 0, 0, 0.4)" : "rgba(2, 70, 139, 0.12)"} !important;
          background: ${isDark ? "rgba(30, 41, 59, 0.7)" : "#ffffff"} !important;
          z-index: 5;
        }

        /* Weekday Header Custom Styles */
        #custom-holiday-calendar th,
        #custom-holiday-calendar .fc-col-header-cell {
          background: transparent !important;
          padding: 12px 0 !important;
          font-weight: 800 !important;
          color: ${isDark ? "#f8fafc" : "#1e293b"} !important; /* Brighter, high-contrast text */
          font-size: 13px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          border: none !important;
        }

        /* Day Numbers inside Cards */
        #custom-holiday-calendar .fc-daygrid-day-number {
          font-size: 13px;
          font-weight: 700;
          padding: 8px 12px !important;
          color: ${isDark ? "#cbd5e1" : "#1e293b"};
          display: inline-block;
        }

        /* Disabled Past Day Cards */
        #custom-holiday-calendar .fc-day-disabled .fc-daygrid-day-frame,
        #custom-holiday-calendar .fc-disabled-day .fc-daygrid-day-frame {
          background-color: ${isDark ? "rgba(15, 23, 42, 0.2)" : "rgba(241, 245, 249, 0.5)"} !important;
          border: 1px dashed ${isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(2, 70, 139, 0.18)"} !important;
          cursor: not-allowed;
        }
        
        #custom-holiday-calendar .fc-day-disabled .fc-daygrid-day-number,
        #custom-holiday-calendar .fc-disabled-day .fc-daygrid-day-number {
          color: ${isDark ? "#64748b" : "#8e9bb0"} !important;
        }
        
        #custom-holiday-calendar .fc-day-disabled:hover .fc-daygrid-day-frame {
          transform: none !important;
          box-shadow: none !important;
        }

        /* Modern Today Card styling with a neon border glow */
        #custom-holiday-calendar .fc-day-today .fc-daygrid-day-frame {
          background: ${isDark ? "rgba(59, 130, 246, 0.05)" : "rgba(59, 130, 246, 0.03)"} !important;
          border-color: #3b82f6 !important;
          border-width: 1.5px !important;
          box-shadow: 0 0 12px rgba(59, 130, 246, 0.15) !important;
        }

        #custom-holiday-calendar .fc-day-today .fc-daygrid-day-number {
          background: #3b82f6 !important;
          color: #ffffff !important;
          border-radius: 9999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          margin: 6px;
          padding: 0 !important;
          font-size: 11px;
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
        }

        /* Modern Event badges */
        #custom-holiday-calendar .fc-daygrid-event {
          border-radius: 6px !important;
          padding: 4px 8px !important;
          font-size: 10px !important;
          font-weight: 700 !important;
          margin: 4px 6px !important;
          border: none !important;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
          transition: transform 0.2s, box-shadow 0.2s;
        }

        #custom-holiday-calendar .fc-daygrid-event:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.12);
        }

        /* Fix event list styles and buttons */
        #custom-holiday-calendar .fc-button {
          background: ${isDark ? "rgba(255, 255, 255, 0.05)" : "#ffffff"} !important;
          border: 1px solid ${isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(2, 70, 139, 0.15)"} !important;
          color: ${isDark ? "#f8fafc" : "#1e293b"} !important;
          font-size: 12px !important;
          font-weight: 600 !important;
          border-radius: 8px !important;
          padding: 6px 12px !important;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02) !important;
          transition: all 0.2s ease !important;
        }

        #custom-holiday-calendar .fc-button:hover {
          background: ${isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(2, 70, 139, 0.04)"} !important;
          border-color: ${isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(2, 70, 139, 0.25)"} !important;
        }

        #custom-holiday-calendar .fc-button-active {
          background: #3b82f6 !important;
          color: #ffffff !important;
          border-color: #3b82f6 !important;
        }
      `}</style>

      <Filter
        name={"Holiday/Special Days"}
        nameShow={false}
        dateShow={false}
        profileShow={true}
      />

      <div className="middle_container">
        <div className="glass-grid-container overflow-hidden h-maxContent">
          {/* HEADER */}
          <div className="data_model_btn camapgin_btn flex justify-between items-center" style={{ padding: "12px 24px", borderBottom: isDark ? "1px solid #334155" : "1px solid rgba(2, 70, 139, 0.08)", background: "transparent" }}>
            <h5 style={{ fontWeight: 700, color: isDark ? "#f8fafc" : "#0f172a", margin: 0 }}>{t("Holiday/Special Days")}</h5>
          </div>

          <div className="flex flex-wrap" style={{ minHeight: "650px" }}>

            {/* Left Sidebar: Upcoming Events & Quick Info */}
            <div id="holidays-upcoming-events" style={{
              flex: isMobile ? "1 1 100%" : "0 0 340px",
              borderRight: isMobile ? "none" : (isDark ? "1px solid #334155" : "1px solid rgba(2, 70, 139, 0.08)"),
              borderBottom: isMobile ? (isDark ? "1px solid #334155" : "1px solid rgba(2, 70, 139, 0.08)") : "none",
              padding: "24px",
              background: isDark ? "rgba(255, 255, 255, 0.03)" : "rgba(255, 255, 255, 0.15)",
              display: "flex",
              flexDirection: "column",
              gap: "20px"
            }}>
              <div>
                <h6 style={{ fontWeight: 800, color: isDark ? "#f8fafc" : "#0f172a", fontSize: "14px", margin: "0 0 4px 0" }}>{t("Upcoming Events")}</h6>
                <p style={{ color: isDark ? "#cbd5e1" : "#64748b", fontSize: "11px", margin: 0 }}>{t("Review schedules and active bid protection status.")}</p>
              </div>

              {/* Event List */}
              <div className="flex flex-col gap-3" style={{ overflowY: "auto", maxHeight: "580px", paddingRight: "4px" }}>
                {events?.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "60px 10px", color: "#94a3b8" }}>
                    <i className="fa fa-calendar-o" style={{ fontSize: "32px", marginBottom: "12px", display: "block", color: "#94a3b8", opacity: 0.6 }} />
                    <span style={{ fontSize: "12px", fontWeight: "500" }}>{t("No holidays configured")}</span>
                  </div>
                ) : (
                  events.slice().sort((a, b) => moment(a.start).diff(moment(b.start))).map((ev) => {
                    const isProtected = ev.extendedProps?.protection?.enabled;
                    return (
                      <div
                        key={ev.id}
                        style={{
                          background: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(255, 255, 255, 0.75)",
                          backdropFilter: "blur(4px)",
                          border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid rgba(2, 70, 139, 0.08)",
                          borderLeft: `4px solid ${ev.backgroundColor || "#1A9FD4"}`,
                          borderRadius: "10px",
                          padding: "14px",
                          transition: "all 0.2s ease",
                          cursor: "pointer",
                          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.01)"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = "translateY(-1px)";
                          e.currentTarget.style.boxShadow = "0 4px 12px rgba(2, 70, 139, 0.06)";
                          e.currentTarget.style.borderColor = isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(2, 70, 139, 0.15)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = "translateY(0)";
                          e.currentTarget.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.01)";
                          e.currentTarget.style.borderColor = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(2, 70, 139, 0.08)";
                        }}
                        onClick={() => handleEventClick({ event: { _def: { publicId: ev.id } } })}
                      >
                        <div className="flex justify-between items-start gap-2" >
                          <span style={{ fontWeight: 700, fontSize: "13px", color: isDark ? "#f8fafc" : "#1e293b", lineBreak: "anywhere" }}>{ev.title}</span>
                          {isProtected && (
                            <span style={{
                              background: "rgba(16, 185, 129, 0.08)",
                              color: "#10b981",
                              fontSize: "9px",
                              fontWeight: "700",
                              padding: "2px 6px",
                              borderRadius: "12px",
                              whiteSpace: "nowrap"
                            }}>
                              <i className="fa fa-shield" style={{ marginRight: "3px" }} />{t("Protected")}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center" style={{ gap: "6px", marginTop: "10px", color: isDark ? "#94a3b8" : "#64748b", fontSize: "11px" }}>
                          <i className="fa fa-calendar-check-o" style={{ color: "#1A9FD4" }} />
                          <span>{moment(ev.start).format("MMM DD")} - {moment(ev.end).subtract(1, "days").format("MMM DD, YYYY")}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Column: Calendar */}
            <div id="custom-holiday-calendar" className="bg-transparent" style={{ flex: "1 1 500px", padding: "24px" }}>
              <FullCalendar
                plugins={[dayGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                events={events}

                /* VIEW */
                eventClick={handleEventClick}

                /* CREATE */
                selectable={canCreateHoliday}
                selectMirror={true}
                unselectAuto={true}
                select={handleDateSelect}

                /* UPDATE */
                editable={canUpdateHoliday}

                dayMaxEvents={3}
                height={isMobile ? "auto" : 700}
                headerToolbar={isMobile ? {
                  left: "prev,next",
                  center: "title",
                  right: "today",
                } : {
                  left: "prev,next today",
                  center: "title",
                  right: "",
                }}
                eventDisplay="block"

                selectAllow={(selectInfo) => {
                  const start = moment(selectInfo.startStr);
                  return start.isSameOrAfter(moment(), "day");
                }}
                eventAllow={(dropInfo) => {
                  const newStart = moment(dropInfo.startStr);
                  return newStart.isSameOrAfter(moment(), "day");
                }}
                dayCellClassNames={(arg) => {
                  if (moment(arg.date).isBefore(moment(), "day")) return ["fc-disabled-day"];
                  return [];
                }}
              />
            </div>
          </div>
        </div>

        <HolidayModal
          show={openModal}
          onClose={() => setOpenModal(false)}
          mode={selectedEvent ? "edit" : "add"}
          initialData={selectedEvent}
          range={selectedRange}
          onSave={handleSave}
          onSuperAdminEventReminderSave={handleSuperAdminEventReminderSave}
          onDelete={handleDelete}
          canUpdate={canUpdateHoliday}
          canRemove={canRemoveHoliday}
        />

        <CustomModal
          show={!!deleteConfirm}
          onHide={() => setDeleteConfirm(null)}
          title={t("Delete Holiday")}
          subtitle={selectedEvent?.title || "Holiday / Special Day"}
          icon="delete"
          iconVariant="danger"
          message={`You are about to permanently delete <span class="cm-highlight">${selectedEvent?.title || "this holiday"}</span>. It will be removed from the calendar immediately.`}
          alertText="This action cannot be undone. Any reminders or protection settings linked to this holiday will also be removed."
          alertVariant="danger"
          closeOnBackdrop={false}
          actions={[
            { label: t("Cancel"), cancel: true, icon: "close", onClick: () => setDeleteConfirm(null), },
            { label: t("Delete Holiday"), variant: "danger", icon: "delete", onClick: executeDelete, },
          ]}
        />
      </div>
    </>
  );
};

export default Holidays;
