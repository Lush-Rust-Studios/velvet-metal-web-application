import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/lib/supabase";
import { storage } from "@/lib/services/storage";
import { RegisterServiceConnection } from "@/shared/services/RegisterServiceConnection";
import { useConnectedServices } from "@/lib/hooks/useConnectedServices";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, Check, Loader2, Upload, X } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  SpotifyIcon,
  AppleMusicIcon,
  TidalIcon,
} from "@/components/icons/service-icons";

type Step = "account" | "subscription" | "services";

interface SubscriptionTier {
  id: string;
  name: string;
  tier: string;
  price: number;
  features: Record<string, any>;
}

export default function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { register, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<Step>(() => {
    // If we have a step in the URL, use that
    const stepParam = searchParams.get("step");
    if (
      stepParam &&
      ["account", "subscription", "services"].includes(stepParam)
    ) {
      return stepParam as Step;
    }
    return "account";
  });
  const [formData, setFormData] = useState({
    email: "",
    display_name: "",
    password: "",
    confirmPassword: "",
    selectedTier: "",
    avatar: null as File | null,
  });

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Update URL when step changes
  useEffect(() => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("step", currentStep);
    navigate(`?${newParams.toString()}`, { replace: true });
  }, [currentStep, navigate, searchParams]);

  // Clear any saved step when first loading the page
  useEffect(() => {
    sessionStorage.removeItem("register_step");
  }, []);

  // Fetch subscription tiers
  const { data: subscriptionTiers } = useQuery<SubscriptionTier[]>({
    queryKey: ["subscription-tiers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_tiers")
        .select("*")
        .order("price");

      if (error) throw error;
      return data;
    },
  });

  const { data: connectedServices, isLoading: isLoadingConnections } =
    useConnectedServices();
  console.log(
    "Connected services:",
    connectedServices,
    "Loading:",
    isLoadingConnections
  ); // Debug log

  // Query sync status for all services
  const { data: syncStatuses, isLoading: isLoadingSync } = useQuery({
    queryKey: ["syncStatuses", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("user_services")
        .select("service, last_library_sync")
        .eq("user_id", user.id);
      console.log("Sync statuses:", data); // Debug log
      return data;
    },
    enabled: !!user?.id,
    refetchInterval: connectedServices?.length ? 2000 : false,
  });

  // If we have sync status and last_library_sync exists (not undefined), we're done syncing
  const isAnySyncing = syncStatuses?.some((status) => {
    const syncing = status.last_library_sync === null;
    console.log(
      "Service:",
      status.service,
      "Last sync:",
      status.last_library_sync,
      "Is syncing:",
      syncing
    ); // Debug log
    return syncing;
  });

  console.log("Final state:", {
    isLoadingConnections,
    isLoadingSync,
    connectedServices,
    syncStatuses,
    isAnySyncing,
  }); // Debug log

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSelectTier = (tierId: string) => {
    setFormData((prev) => ({
      ...prev,
      selectedTier: tierId,
    }));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await handleFileUpload(file);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Avatar image must be less than 2MB");
      return;
    }

    // Create preview URL
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setFormData((prev) => ({ ...prev, avatar: file }));
  };

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      await handleFileUpload(file);
    } else {
      toast.error("Please upload an image file");
    }
  }, []);

  const removeAvatar = useCallback(() => {
    setFormData((prev) => ({ ...prev, avatar: null }));
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }, [previewUrl]);

  const uploadAvatar = async (userId: string) => {
    if (!formData.avatar) return null;

    try {
      const fileExt = formData.avatar.name.split(".").pop();
      const fileName = `${userId}/${Math.random()}.${fileExt}`;

      const publicUrl = await storage.uploadFile(
        "avatars",
        fileName,
        formData.avatar
      );
      return publicUrl;
    } catch (error) {
      console.error("Error uploading avatar:", error);
      return null;
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (formData.password !== formData.confirmPassword) {
        toast.error("Passwords do not match");
        return;
      }

      // Register the user
      await register(formData.email, formData.password, formData.display_name);

      // Get the newly registered user
      const {
        data: { user: newUser },
      } = await supabase.auth.getUser();

      if (newUser && formData.avatar) {
        const avatarUrl = await uploadAvatar(newUser.id);

        if (avatarUrl) {
          const { error: updateError } = await supabase
            .from("profiles")
            .update({ avatar_url: avatarUrl })
            .eq("id", newUser.id);

          if (updateError) {
            console.error("Error updating profile with avatar:", updateError);
          }
        }
      }

      setCurrentStep("subscription");
    } catch (error: any) {
      toast.error(error.message || "An error occurred during registration");
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = () => {
    navigate("/home");
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case "account":
        return "Create Your\nAccount";
      case "subscription":
        return "Choose Your\nPlan";
      case "services":
        return "Connect Your\nServices";
    }
  };

  const getStepDescription = () => {
    switch (currentStep) {
      case "account":
        return "Start managing your music library";
      case "subscription":
        return "Select a plan that fits your needs";
      case "services":
        return "Connect your favorite streaming services";
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case "account":
        return (
          <motion.form
            className="space-y-6"
            onSubmit={handleRegister}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <div className="space-y-4">
              <Input
                type="text"
                name="display_name"
                value={formData.display_name}
                onChange={handleChange}
                placeholder="Display Name"
                required
                className="h-12 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-white/20 focus:ring-white/20 font-degular"
                autoComplete="name"
              />
              <Input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="Email"
                required
                className="h-12 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-white/20 focus:ring-white/20 font-degular"
                autoComplete="email"
              />
              <Input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Password"
                required
                className="h-12 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-white/20 focus:ring-white/20 font-degular"
                autoComplete="new-password"
              />
              <Input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Confirm Password"
                required
                className="h-12 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-white/20 focus:ring-white/20 font-degular"
                autoComplete="new-password"
              />
              <div
                className={`relative space-y-2 ${
                  formData.avatar ? "pb-4" : ""
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <label className="block text-sm text-gray-500 mb-2">
                  Profile Picture (Optional)
                </label>

                {previewUrl ? (
                  <div className="relative w-24 h-24 mx-auto mb-4">
                    <img
                      src={previewUrl}
                      alt="Avatar preview"
                      className="w-full h-full object-cover rounded-full ring-2 ring-white/20"
                    />
                    <button
                      type="button"
                      onClick={removeAvatar}
                      className="absolute -top-2 -right-2 p-1 bg-black/80 rounded-full hover:bg-black/60 transition-colors"
                    >
                      <X className="w-4 h-4 text-white" />
                    </button>
                  </div>
                ) : (
                  <div
                    className={`relative border-2 border-dashed rounded-lg p-6 transition-colors ${
                      isDragging
                        ? "border-white/40 bg-white/5"
                        : "border-white/10 hover:border-white/20"
                    }`}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="text-center">
                      <Upload className="mx-auto h-8 w-8 text-gray-500" />
                      <div className="mt-2">
                        <p className="text-sm text-gray-500">
                          Drag and drop an image, or{" "}
                          <span className="text-white">browse</span>
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                          PNG, JPG up to 2MB
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-white font-degular hover:bg-gray-100 text-black font-medium text-lg relative overflow-hidden group"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <span>Continue</span>
              )}
            </Button>

            <div className="text-center">
              <p className="text-gray-400 font-degular">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  className="text-white hover:underline focus:outline-hidden"
                >
                  Sign in
                </button>
              </p>
            </div>
          </motion.form>
        );

      case "subscription":
        return (
          <motion.div
            className="space-y-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <div className="space-y-4">
              {subscriptionTiers?.map((tier) => (
                <Card
                  key={tier.id}
                  className={`relative p-6 transition-all duration-300 bg-white/[0.03] border-white/10 hover:bg-white/[0.06] ${
                    formData.selectedTier === tier.id ? "ring-2 ring-white" : ""
                  }`}
                  onClick={() => handleSelectTier(tier.id)}
                >
                  <div className="relative z-10 flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="text-xl font-degular font-semibold mb-1 text-white font-degular">
                        {tier.name}
                      </h3>
                      <p className="text-3xl font-bold flex items-baseline text-white font-degular">
                        ${tier.price.toFixed(2)}
                        <span className="text-sm font-normal text-gray-400 ml-2">
                          /mo
                        </span>
                      </p>
                    </div>
                    <div className="flex-1">
                      <ul className="space-y-2">
                        {Object.entries(tier.features).map(([key, value]) => (
                          <li
                            key={key}
                            className="flex items-center text-sm text-gray-300 font-degular"
                          >
                            <Check className="w-4 h-4 mr-3 text-white/60 shrink-0" />
                            <span className="capitalize">
                              {key === "max_playlists" ? (
                                <>
                                  {value === -1 ? "Unlimited" : value} playlists
                                </>
                              ) : key === "sync_interval" ? (
                                <>{value} sync</>
                              ) : key === "priority_support" ? (
                                "Priority support"
                              ) : key === "custom_features" ? (
                                "Custom features"
                              ) : (
                                key.split("_").join(" ")
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <div className="flex justify-between mt-8">
              <Button
                onClick={() => setCurrentStep("services")}
                disabled={!formData.selectedTier}
                className="w-full h-12 bg-white hover:bg-gray-100 text-black font-medium text-lg font-degular"
              >
                Continue
              </Button>
            </div>
          </motion.div>
        );

      case "services":
        return (
          <motion.div
            className="space-y-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <div className="space-y-4">
              {[
                {
                  name: "Spotify",
                  description:
                    "Connect your Spotify account to sync your playlists and library",
                  service: "spotify" as const,
                  icon: <SpotifyIcon className="w-8 h-8 text-[#1DB954]" />,
                },
                {
                  name: "Apple Music",
                  description: "Sync your Apple Music library and playlists",
                  service: "apple-music" as const,
                  icon: <AppleMusicIcon className="w-8 h-8 text-[#FA243C]" />,
                },
                {
                  name: "Tidal",
                  description: "Coming soon - Connect your Tidal account",
                  service: "tidal" as const,
                  icon: <TidalIcon className="w-8 h-8 text-white" />,
                  disabled: true,
                },
              ].map((service) => (
                <Card
                  key={service.name}
                  className={`relative p-6 transition-all duration-300 bg-white/[0.03] border-white/10 hover:bg-white/[0.06] ${
                    service.disabled
                      ? "opacity-50 cursor-not-allowed"
                      : "cursor-pointer"
                  }`}
                  onClick={() => {
                    if (!service.disabled) {
                      // Save current URL with step parameter
                      sessionStorage.setItem(
                        "auth_callback_url",
                        `/register?step=services`
                      );
                    }
                  }}
                >
                  <div className="relative z-10 flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{service.icon}</span>
                        <div>
                          <h3 className="text-xl font-semibold text-white font-degular">
                            {service.name}
                          </h3>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center">
                      {!service.disabled ? (
                        <RegisterServiceConnection service={service.service} />
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-white/10 text-white hover:bg-white/20 border-0 opacity-50 cursor-not-allowed"
                          disabled
                        >
                          Coming Soon
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <div className="flex justify-between mt-8">
              <Button
                onClick={handleFinish}
                className="w-full h-12 bg-white hover:bg-gray-100 text-black font-medium text-lg font-degular disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!connectedServices?.length || isAnySyncing}
              >
                {isAnySyncing
                  ? "Syncing Library..."
                  : !connectedServices?.length
                  ? "Connect a Service First"
                  : "Go to App"}
              </Button>
            </div>
          </motion.div>
        );
    }
  };

  return (
    <div
      className="min-h-screen w-full bg-cover bg-center bg-no-repeat"
      style={{
        backgroundImage: 'url("/images/background.jpg")',
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        backgroundBlendMode: "overlay",
      }}
    >
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Navigation */}
        <nav className="p-6 flex justify-between items-center">
          <div className="flex items-center gap-3">
            {currentStep !== "account" && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (currentStep === "services")
                    setCurrentStep("subscription");
                  if (currentStep === "subscription") setCurrentStep("account");
                }}
                className="text-white"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            )}
            <h1 className="text-xl font-semibold text-white">Velvet Metal</h1>
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1 flex items-center justify-center p-6">
          <motion.div
            className="w-full max-w-md space-y-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Header */}
            <div className="text-center">
              <motion.h1
                className="text-6xl font-bold tracking-tighter mb-2 text-white"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                {getStepTitle()}
              </motion.h1>
              <motion.p
                className="text-gray-400 text-lg font-degular"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                {getStepDescription()}
              </motion.p>
            </div>

            {/* Step Indicator */}
            <div className="flex justify-between items-center space-x-2">
              {["account", "subscription", "services"].map((step, index) => (
                <div key={step} className="flex-1">
                  <div
                    className={`h-2 rounded-full transition-colors ${
                      index <=
                      ["account", "subscription", "services"].indexOf(
                        currentStep
                      )
                        ? "bg-white"
                        : "bg-white/10"
                    }`}
                  />
                </div>
              ))}
            </div>

            {renderStep()}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
