import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Toast from "./../../../common/helper/toast/Toast";
import { ApiGetSupportChat, ApiSendSupportMessage, ApiFileUpload } from "./../../../api-wrapper/customer/ApiCustomer";
import Filter from "../../../helper/filter/Filter";
import { Send, Image, X, Headphones } from "lucide-react";
import { ROLES } from "src/common/constants";

const formatTime = (date) =>
  date ? new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

const formatDate = (date) =>
  new Date(date).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });

const isSameDay = (d1, d2) => d1 && d2 && new Date(d1).toDateString() === new Date(d2).toDateString();

const AuthSupportChat = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { ticketId } = useParams();
  const role = localStorage.getItem("role");

  const [loading, setLoading] = useState(true);
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef(null);

  const [imageUrl, setImageUrl] = useState("");
  const fileInputRef = useRef(null);
  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  const isOwner = role === ROLES.SUPER_ADMIN || role === ROLES.ADMIN;

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  /* ---------- AUTO SCROLL ---------- */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ---------- ROLE CHECK ---------- */
  const isEndUser = (msg) => msg.from === "user";
  const isRightAligned = (msg) => {
    if (isOwner) return msg.from === "bot";
    return msg.from === "user";
  };

  /* ---------- FETCH DATA ---------- */
  useEffect(() => {
    if (!ticketId) return;

    const fetchChat = async () => {
      setLoading(true);
      try {
        const res = await ApiGetSupportChat({ ticketId });
        if (res?.isSuccess && res?.data) {
          setTicket(res.data.ticket || null);
          setMessages(res.data.messages || []);
        } else {
          Toast.error(res?.messages ?? t("No ticket found"));
          setTicket(null);
        }
      } catch (err) {
        Toast.error(t("Unable to load support chat"));
        setTicket(null);
      } finally {
        setLoading(false);
      }
    };

    fetchChat();
  }, [ticketId]);

  /* ---------- SEND MESSAGE ---------- */
  const sendMessage = async () => {
    if ((!message.trim() && !imageUrl) || !ticket?._id) return;

    const from = isOwner ? "bot" : "user";

    const newMsg = { from, text: message || "", image: imageUrl || null, createdAt: new Date() };
    setMessages((prev) => [...prev, newMsg]);
    setMessage("");
    setImageUrl("");

    try {
      await ApiSendSupportMessage({ ticketId: ticket._id, text: newMsg.text, fileUrl: newMsg.image, from });
    } catch {
      Toast.error(t("Message failed to send"));
    }
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      Toast.error(t("Only image files are allowed"));
      return;
    }

    try {
      const formData = new FormData();
      formData.append("image", file);

      const res = await ApiFileUpload(formData);
      if (!res?.isSuccess || !res?.data?.image) throw new Error("Upload failed");

      setImageUrl(res?.data?.image);
    } catch (err) {
      Toast.error(t("Invalid file type! Only Images or Excel files allowed."));
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex justify-center items-center bg-slate-50 dark:bg-slate-950">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-sky-500 border-t-transparent" />
      </div>
    );
  }

  /* ---------- NO TICKET ---------- */
  if (!ticket) {
    return (
      <div className="h-screen w-full flex justify-center items-center bg-slate-50 dark:bg-slate-950 p-4">
        <div className="w-full max-w-md p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center shadow-lg">
          <Headphones className="mx-auto h-12 w-12 text-[#2374F1] mb-3" />
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{t("No ticket found")}</h3>
          <button
            onClick={() => navigate(isOwner ? "/support-ticket" : "/")}
            className="mt-4 px-4 py-2 text-sm font-semibold text-white bg-[#2374F1] hover:bg-[#158cb8] rounded-lg transition-colors focus:outline-none"
          >
            {isOwner ? t("Back to Tickets") : t("Back to Home")}
          </button>
        </div>
      </div>
    );
  }

  /* ---------- CHAT UI ---------- */
  return (
    <>
      <Filter name={"Support Ticket"} nameShow={false} dateShow={false} profileShow={true} />

      <div className="" style={{ paddingTop: 0 }}>
        <div className="h-maxContent" style={{ marginTop: 0 }}>
          <div className="w-full flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden" style={{ height: isOwner ? "calc(100vh - 190px)" : "calc(100vh - 140px)" }}>

            {/* HEADER */}
            <div className="px-6 py-4 flex items-center bg-[#2374F1] text-white">
              <Headphones className="mr-2 h-5 w-5 shrink-0" />
              <span className="font-semibold text-base">Advertise IQ – Support Chat</span>
              <button
                type="button"
                onClick={() => navigate(isOwner ? "/support-ticket" : "/")}
                className="ml-auto border border-white/50 hover:bg-white/15 hover:border-white transition-colors text-xs font-semibold rounded-lg px-4 py-2 focus:outline-none"
              >
                {isOwner ? "Back to Tickets" : "Back to Home"}
              </button>
            </div>

            {/* MESSAGES */}
            <div className="flex-1 p-6 overflow-y-auto bg-slate-50/50 dark:bg-slate-900/40 space-y-4">
              {messages.map((msg, i) => {
                const prevMsg = messages[i - 1];
                const isRight = isRightAligned(msg);
                const isUser = isEndUser(msg);
                const showDateSeparator = !prevMsg || !isSameDay(prevMsg.createdAt, msg.createdAt);

                return (
                  <div key={i} className="flex flex-col gap-2">
                    {/* DATE SEPARATOR */}
                    {showDateSeparator && (
                      <div className="text-center my-3">
                        <span className="px-3 py-1 bg-slate-200/80 dark:bg-slate-800 rounded-full text-[11px] font-semibold text-slate-500 dark:text-slate-400 inline-block">
                          {formatDate(msg.createdAt)}
                        </span>
                      </div>
                    )}

                    {/* MESSAGE ROW */}
                    <div className={`flex items-start gap-3 w-full max-w-[80%] ${isRight ? "flex-row-reverse ml-auto" : "mr-auto"}`}>

                      {/* AVATAR */}
                      {isUser ? (
                        <div className="w-8 h-8 rounded-full bg-[#2374F1] text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-sm uppercase">
                          {ticket.userName?.charAt(0)}
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-full border border-slate-300 dark:border-slate-600 bg-white flex items-center justify-center shrink-0 shadow-sm overflow-hidden">
                          <img
                            src="https://app.advertiseiq.co/advertise IQ.png"
                            alt="A"
                            className="w-full h-full object-contain p-0.5"
                          />
                        </div>
                      )}

                      {/* BUBBLE CONTENT */}
                      <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm relative ${isRight
                        ? "bg-[#2374F1] text-white rounded-tr-none"
                        : "bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 text-slate-800 dark:text-slate-200 rounded-tl-none"
                        }`}>
                        {/* TEXT MESSAGE */}
                        {msg.text && (
                          <div
                            className="word-break-all whitespace-pre-wrap font-medium"
                            dangerouslySetInnerHTML={{ __html: msg.text }}
                          />
                        )}

                        {/* IMAGE MESSAGE */}
                        {msg.image && (
                          <div className="mt-2">
                            <a href={msg.image} target="_blank" rel="noopener noreferrer" className="block max-w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                              <img
                                src={msg.image}
                                alt="attachment"
                                className="max-w-full max-h-[240px] rounded-lg cursor-pointer hover:opacity-90 transition-opacity duration-150 block object-cover"
                              />
                            </a>
                          </div>
                        )}
                        <span className="block text-[10px] text-right mt-1 opacity-70 font-semibold select-none">
                          {formatTime(msg.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* IMAGE PREVIEW DRAWER */}
            {imageUrl && (
              <div className="px-6 py-2 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div className="relative w-28 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 group">
                  <img
                    src={imageUrl}
                    alt="preview"
                    className="w-full display-block object-cover h-20"
                  />
                  <button
                    type="button"
                    onClick={() => setImageUrl("")}
                    className="absolute top-1 right-1 bg-white hover:bg-slate-100 text-slate-600 rounded-full p-1 shadow-md focus:outline-none transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* INPUT BAR */}
            <div className="p-4 flex gap-3 items-center border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">

              {/* IMAGE SELECT BUTTON */}
              <button
                type="button"
                onClick={() => fileInputRef.current.click()}
                className="h-12 w-12 rounded-full border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-950 flex items-center justify-center text-slate-500 dark:text-slate-400 transition-colors focus:outline-none"
              >
                <Image className="h-5 w-5" />
              </button>

              <input
                hidden
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={handleImageSelect}
              />

              {/* TEXT INPUT */}
              <input
                type="text"
                placeholder={t("Type your message...")}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                className="flex-1 h-12 px-6 rounded-full border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-[#2374F1] transition-colors text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400"
              />

              {/* SEND BUTTON */}
              <button
                type="button"
                onClick={sendMessage}
                className="h-12 w-12 rounded-full bg-[#2374F1] hover:bg-[#158cb8] flex items-center justify-center text-white shadow-md transition-colors focus:outline-none"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default AuthSupportChat;
