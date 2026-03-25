"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore"
import { db } from "@/lib/firebase"
import Link from "next/link"
import { KeyRound, Plug, Users } from "lucide-react"
import { sanitizeMultilineText } from "@/lib/dataspace"
import { useUserProfile } from "@/lib/use-user-profile"

// Toast simples
function Toast({ message, actionLabel, onAction, onClose }: { message: string, actionLabel: string, onAction: () => void, onClose: () => void }) {
    return (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/30">
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full border border-gray-200">
                <div className="mb-4 text-gray-800">{message}</div>
                <div className="flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onAction}
                        className="px-4 py-2 rounded bg-red-600 hover:bg-red-700 text-white font-medium"
                    >
                        {actionLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}

// Definição de tipos para Federation e EditForm
type Federation = {
    id: string
    name?: string
    description?: string
    scope?: string
    notes?: string
    federationType?: string
    catalogVisibility?: string
    admissionMode?: string
    publishedInCatalog?: boolean
    governanceModel?: string
    memberCriteria?: string
    dataDomains?: string
    usageRules?: string
    licenseType?: string
    dataLaw?: string
    traceabilityAccepted?: boolean
    ownershipAccepted?: boolean
    termsAccepted?: boolean
    organization?: string
    contactEmail?: string
    website?: string
    ownerId?: string
    createdAt?: unknown // ajuste de any para unknown
    updatedAt?: unknown // ajuste de any para unknown
    [key: string]: unknown // ajuste de any para unknown
}

type EditForm = Federation

type FederationMembership = {
    id: string
    requesterId: string
    requesterName?: string
    requesterEmail?: string
    participantId?: string
    connectorConnectionId?: string
    membershipType?: string
    status: string
    purpose?: string
    createdAt?: { toDate?: () => Date }
    updatedAt?: { toDate?: () => Date }
}

type FederationInvite = {
    id: string
    inviteeEmail: string
    status: string
    expiresAt?: { toDate?: () => Date }
    signatureRequested?: boolean
}

type ConnectorConnection = {
    id: string
    requesterId?: string
    requesterName?: string
    requesterEmail?: string
    consumerParticipantId?: string
    consumerConnectorDspBaseUrl?: string
    status: string
    createdAt?: { toDate?: () => Date }
    updatedAt?: { toDate?: () => Date }
}

type ConnectorOwnerProfile = {
    participantId?: string
    connectorDspBaseUrl?: string
    connectorManagementBaseUrl?: string
    federatedCatalogUrl?: string
}

export default function FederationDetailsPage() {
    const { user, profile } = useUserProfile()
    const params = useParams()
    const router = useRouter()
    const [federation, setFederation] = useState<Federation | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [isEditing, setIsEditing] = useState(false)
    const [editForm, setEditForm] = useState<EditForm | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)
    const [showDeleteToast, setShowDeleteToast] = useState(false)
    const [membershipPurpose, setMembershipPurpose] = useState("")
    const [membershipTermsAccepted, setMembershipTermsAccepted] = useState(false)
    const [membershipMessage, setMembershipMessage] = useState("")
    const [membershipError, setMembershipError] = useState("")
    const [membershipSubmitting, setMembershipSubmitting] = useState(false)
    const [membershipLoading, setMembershipLoading] = useState(false)
    const [currentMembership, setCurrentMembership] = useState<FederationMembership | null>(null)
    const [federationMemberships, setFederationMemberships] = useState<FederationMembership[]>([])
    const [ownerConnector, setOwnerConnector] = useState<ConnectorOwnerProfile | null>(null)
    const [currentConnection, setCurrentConnection] = useState<ConnectorConnection | null>(null)
    const [connectorConnections, setConnectorConnections] = useState<ConnectorConnection[]>([])
    const [connectionMessage, setConnectionMessage] = useState("")
    const [connectionError, setConnectionError] = useState("")
    const [connectionSubmitting, setConnectionSubmitting] = useState(false)
    const [inviteEmail, setInviteEmail] = useState("")
    const [inviteMessage, setInviteMessage] = useState("")
    const [inviteError, setInviteError] = useState("")
    const [inviteSubmitting, setInviteSubmitting] = useState(false)
    const [currentInvite, setCurrentInvite] = useState<FederationInvite | null>(null)
    const [federationInvites, setFederationInvites] = useState<FederationInvite[]>([])
    const [membershipsVersion, setMembershipsVersion] = useState(0)

    useEffect(() => {
        const fetchFederation = async () => {
            if (!params || !("id" in params)) {
                setLoading(false)
                return
            }

            try {
                setLoading(true)
                setError(null)

                const docRef = doc(db, "federations", params.id as string)
                const docSnap = await getDoc(docRef)

                if (docSnap.exists()) {
                    const data = docSnap.data()
                    setFederation({ id: docSnap.id, ...data })
                    setEditForm({ id: docSnap.id, ...data })
                } else {
                    setError("Federation not found")
                }
            } catch (err) {
                console.error("Error fetching federation:", err)
                setError("Error loading federation")
            } finally {
                setLoading(false)
            }
        }

        fetchFederation()
    }, [params])

    const canManageFederation = Boolean(
        user &&
        profile?.userType === "datasource" &&
        federation?.ownerId &&
        user.uid === federation.ownerId,
    )
    const canRequestMembership = Boolean(user && profile?.userType === "dataclient")
    const hasConsumerConnectorProfile = Boolean(profile?.participantId && profile?.connectorDspBaseUrl)

    useEffect(() => {
        const loadOwnerConnector = async () => {
            if (!federation?.ownerId) {
                setOwnerConnector(null)
                return
            }

            try {
                const ownerSnapshot = await getDoc(doc(db, "users", federation.ownerId))
                if (!ownerSnapshot.exists()) {
                    setOwnerConnector(null)
                    return
                }

                const ownerData = ownerSnapshot.data()
                setOwnerConnector({
                    participantId: typeof ownerData.participantId === "string" ? ownerData.participantId : "",
                    connectorDspBaseUrl: typeof ownerData.connectorDspBaseUrl === "string" ? ownerData.connectorDspBaseUrl : "",
                    connectorManagementBaseUrl:
                        typeof ownerData.connectorManagementBaseUrl === "string" ? ownerData.connectorManagementBaseUrl : "",
                    federatedCatalogUrl: typeof ownerData.federatedCatalogUrl === "string" ? ownerData.federatedCatalogUrl : "",
                })
            } catch (err) {
                console.error("Error loading owner connector:", err)
                setOwnerConnector(null)
            }
        }

        void loadOwnerConnector()
    }, [federation?.ownerId])

    useEffect(() => {
        const loadFederationAccessState = async () => {
            if (!federation?.id || !user) {
                setCurrentMembership(null)
                setFederationMemberships([])
                setCurrentConnection(null)
                setConnectorConnections([])
                setCurrentInvite(null)
                setFederationInvites([])
                return
            }

            try {
                setMembershipLoading(true)
                setMembershipError("")

                const tasks: Promise<void>[] = []

                tasks.push((async () => {
                    if (!federation.ownerId) {
                        setCurrentConnection(null)
                        return
                    }

                    const connectionQuery = query(
                        collection(db, "connectorConnections"),
                        where("ownerId", "==", federation.ownerId),
                        where("requesterId", "==", user.uid),
                    )
                    const connectionSnapshot = await getDocs(connectionQuery)
                    const connection = connectionSnapshot.docs
                        .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() } as ConnectorConnection))
                        .sort((a, b) => {
                            const aTime = a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0
                            const bTime = b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0
                            return bTime - aTime
                        })[0] ?? null

                    setCurrentConnection(connection)
                })())

                tasks.push((async () => {
                    const currentQuery = query(
                        collection(db, "federationMemberships"),
                        where("federationId", "==", federation.id),
                        where("requesterId", "==", user.uid),
                    )
                    const currentSnapshot = await getDocs(currentQuery)
                    const current = currentSnapshot.docs
                        .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() } as FederationMembership))
                        .sort((a, b) => {
                            const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0
                            const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0
                            return bTime - aTime
                        })[0] ?? null

                    setCurrentMembership(current)
                })())

                tasks.push((async () => {
                    if (!user.email) {
                        setCurrentInvite(null)
                        return
                    }

                    const inviteQuery = query(
                        collection(db, "federationInvites"),
                        where("federationId", "==", federation.id),
                        where("inviteeEmail", "==", user.email.toLowerCase()),
                    )
                    const inviteSnapshot = await getDocs(inviteQuery)
                    const invite = inviteSnapshot.docs
                        .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() } as FederationInvite))
                        .sort((a, b) => {
                            const aTime = a.expiresAt?.toDate ? a.expiresAt.toDate().getTime() : 0
                            const bTime = b.expiresAt?.toDate ? b.expiresAt.toDate().getTime() : 0
                            return bTime - aTime
                        })[0] ?? null

                    setCurrentInvite(invite)
                })())

                tasks.push((async () => {
                    if (!canManageFederation || !federation.ownerId) {
                        setConnectorConnections([])
                        return
                    }

                    const connectionQueueQuery = query(
                        collection(db, "connectorConnections"),
                        where("ownerId", "==", federation.ownerId),
                    )
                    const connectionQueueSnapshot = await getDocs(connectionQueueQuery)
                    const rows = connectionQueueSnapshot.docs
                        .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() } as ConnectorConnection))
                        .sort((a, b) => {
                            const aTime = a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0
                            const bTime = b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0
                            return bTime - aTime
                        })

                    setConnectorConnections(rows)
                })())

                tasks.push((async () => {
                    if (!canManageFederation) {
                        setFederationMemberships([])
                        return
                    }

                    const queueQuery = query(collection(db, "federationMemberships"), where("federationId", "==", federation.id))
                    const queueSnapshot = await getDocs(queueQuery)
                    const rows = queueSnapshot.docs
                        .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() } as FederationMembership))
                        .sort((a, b) => {
                            const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0
                            const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0
                            return bTime - aTime
                        })

                    setFederationMemberships(rows)
                })())

                tasks.push((async () => {
                    if (!canManageFederation) {
                        setFederationInvites([])
                        return
                    }

                    const inviteQuery = query(collection(db, "federationInvites"), where("federationId", "==", federation.id))
                    const inviteSnapshot = await getDocs(inviteQuery)
                    const rows = inviteSnapshot.docs
                        .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() } as FederationInvite))
                        .sort((a, b) => {
                            const aTime = a.expiresAt?.toDate ? a.expiresAt.toDate().getTime() : 0
                            const bTime = b.expiresAt?.toDate ? b.expiresAt.toDate().getTime() : 0
                            return bTime - aTime
                        })

                    setFederationInvites(rows)
                })())

                await Promise.all(tasks)
            } catch (err) {
                console.error("Error loading federation access state:", err)
                setMembershipError("Could not load federation membership data.")
                setInviteError("Could not load federation invitation data.")
            } finally {
                setMembershipLoading(false)
            }
        }

        loadFederationAccessState()
    }, [federation?.id, federation?.ownerId, user, canManageFederation, membershipsVersion])

    const handleEdit = () => {
        if (!canManageFederation) return
        setIsEditing(true)
    }

    const handleSave = async () => {
        if (!editForm || !federation || !canManageFederation) return

        try {
            const docRef = doc(db, "federations", federation.id)
            await updateDoc(docRef, {
                ...editForm,
                updatedAt: new Date(),
            })
            setFederation(editForm)
            setIsEditing(false)
        } catch (err) {
            console.error("Error updating federation:", err)
            setError("Error updating federation")
        }
    }

    const handleCancel = () => {
        setEditForm(federation)
        setIsEditing(false)
    }

    // Toast de confirmação de delete
    const handleDelete = () => {
        if (!canManageFederation) return
        setShowDeleteToast(true)
    }

    const confirmDelete = async () => {
        if (!federation || !canManageFederation) return
        try {
            setIsDeleting(true)
            setShowDeleteToast(false)
            const docRef = doc(db, "federations", federation.id)
            await deleteDoc(docRef)
            router.push("/federations/browse")
        } catch (err) {
            console.error("Error deleting federation:", err)
            setError("Error deleting federation")
            setIsDeleting(false)
        }
    }

    const handleInputChange = (field: string, value: string | boolean) => {
        if (editForm) {
            setEditForm({ ...editForm, [field]: value })
        }
    }

    const publishFederationToCatalog = async () => {
        if (!federation || !canManageFederation) return
        if (!profile?.participantId || !profile?.connectorDspBaseUrl) {
            setMembershipError("Configure the provider connector profile before publishing this federation.")
            return
        }

        try {
            await updateDoc(doc(db, "federations", federation.id), {
                publishedInCatalog: true,
                status: "published",
                updatedAt: serverTimestamp(),
            })
            await setDoc(doc(db, "catalogPublications", `federation-${federation.id}`), {
                scope: "federation",
                scopeId: federation.id,
                connectorParticipantId: profile?.participantId ?? federation.ownerId ?? "",
                dspEndpoint: profile?.connectorDspBaseUrl ?? "",
                catalogEndpoint: profile?.federatedCatalogUrl ?? "",
                published: true,
                lastPublishedAt: serverTimestamp(),
                ownerId: federation.ownerId ?? "",
                ownerEmail: typeof federation.ownerEmail === "string" ? federation.ownerEmail : "",
                ownerName: typeof federation.ownerName === "string" ? federation.ownerName : "",
            })
            const nextFederation = { ...federation, publishedInCatalog: true, status: "published" }
            setFederation(nextFederation)
            setEditForm(nextFederation)
            setMembershipMessage("Federation metadata published to the federated catalog.")
        } catch (err) {
            console.error("Error publishing federation to catalog:", err)
            setMembershipError("Could not publish the federation to the catalog.")
        }
    }

    const unpublishFederationFromCatalog = async () => {
        if (!federation || !canManageFederation) return

        try {
            await updateDoc(doc(db, "federations", federation.id), {
                publishedInCatalog: false,
                status: "draft",
                updatedAt: serverTimestamp(),
            })
            await setDoc(doc(db, "catalogPublications", `federation-${federation.id}`), {
                scope: "federation",
                scopeId: federation.id,
                connectorParticipantId: profile?.participantId ?? federation.ownerId ?? "",
                dspEndpoint: profile?.connectorDspBaseUrl ?? "",
                catalogEndpoint: profile?.federatedCatalogUrl ?? "",
                published: false,
                lastPublishedAt: serverTimestamp(),
                ownerId: federation.ownerId ?? "",
                ownerEmail: typeof federation.ownerEmail === "string" ? federation.ownerEmail : "",
                ownerName: typeof federation.ownerName === "string" ? federation.ownerName : "",
            })
            const nextFederation = { ...federation, publishedInCatalog: false, status: "draft" }
            setFederation(nextFederation)
            setEditForm(nextFederation)
            setMembershipMessage("Federation metadata removed from the federated catalog.")
        } catch (err) {
            console.error("Error unpublishing federation from catalog:", err)
            setMembershipError("Could not remove the federation from the catalog.")
        }
    }

    const issueMembershipCredential = async (membership: FederationMembership) => {
        if (!federation) return ""

        const credentialRef = await addDoc(collection(db, "credentialGrants"), {
            participantId: membership.participantId ?? membership.requesterId,
            requesterId: membership.requesterId,
            requesterEmail: membership.requesterEmail ?? "",
            federationId: federation.id,
            agreementId: membership.id,
            credentialType: "membership",
            status: "active",
            issuedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            ownerId: federation.ownerId ?? "",
            ownerEmail: typeof federation.ownerEmail === "string" ? federation.ownerEmail : "",
            ownerName: typeof federation.ownerName === "string" ? federation.ownerName : "",
        })

        await updateDoc(doc(db, "federationMemberships", membership.id), {
            credentialId: credentialRef.id,
            updatedAt: serverTimestamp(),
        })

        return credentialRef.id
    }

    const requestConnectorConnection = async () => {
        if (!user || !profile || !federation || !canRequestMembership) return

        if (!hasConsumerConnectorProfile) {
            setConnectionError("Configure your consumer connector profile before requesting a provider connector connection.")
            return
        }

        if (!ownerConnector?.participantId || !ownerConnector.connectorDspBaseUrl) {
            setConnectionError("The Data Owner connector profile is not ready yet. Try again later.")
            return
        }

        if (currentConnection && ["requested", "active"].includes(currentConnection.status)) {
            setConnectionError("A connector connection already exists or is pending for this owner.")
            return
        }

        try {
            setConnectionSubmitting(true)
            setConnectionError("")
            setConnectionMessage("")

            await addDoc(collection(db, "connectorConnections"), {
                ownerId: federation.ownerId ?? "",
                ownerEmail: typeof federation.ownerEmail === "string" ? federation.ownerEmail : "",
                ownerName: typeof federation.ownerName === "string" ? federation.ownerName : "",
                providerParticipantId: ownerConnector.participantId,
                providerConnectorDspBaseUrl: ownerConnector.connectorDspBaseUrl,
                providerConnectorManagementBaseUrl: ownerConnector.connectorManagementBaseUrl ?? "",
                providerCatalogUrl: ownerConnector.federatedCatalogUrl ?? "",
                requesterId: user.uid,
                requesterEmail: user.email ?? "",
                requesterName: profile.name ?? user.displayName ?? user.email ?? user.uid,
                consumerParticipantId: profile.participantId ?? user.uid,
                consumerConnectorDspBaseUrl: profile.connectorDspBaseUrl ?? "",
                consumerConnectorManagementBaseUrl: profile.connectorManagementBaseUrl ?? "",
                consumerCatalogUrl: profile.federatedCatalogUrl ?? "",
                status: "requested",
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            })

            setConnectionMessage("Connector connection request submitted. Wait for the Data Owner to approve it before requesting federation membership.")
            setMembershipsVersion((value) => value + 1)
        } catch (err) {
            console.error("Error requesting connector connection:", err)
            setConnectionError("Could not submit the connector connection request.")
        } finally {
            setConnectionSubmitting(false)
        }
    }

    const requestMembership = async () => {
        if (!user || !profile || !federation || !canRequestMembership) return

        if (currentMembership) {
            setMembershipError("You already have a membership record for this federation.")
            return
        }

        if (!hasConsumerConnectorProfile) {
            setMembershipError("Configure your consumer connector profile before requesting federation membership.")
            return
        }

        if (!currentConnection || currentConnection.status !== "active") {
            setMembershipError("Establish and activate the connector connection before requesting federation membership.")
            return
        }

        if ((federation.admissionMode ?? "") === "invite-only") {
            setMembershipError("This federation is invite-only. Wait for a signed invitation from the owner.")
            return
        }

        if (!membershipTermsAccepted) {
            setMembershipError("Confirm federation rules and traceability before submitting your membership request.")
            return
        }

        try {
            setMembershipSubmitting(true)
            setMembershipError("")
            setMembershipMessage("")

            const autoApprove = (federation.admissionMode ?? "") === "self-service"
            const status = autoApprove ? "active" : "requested"
            const membershipRef = await addDoc(collection(db, "federationMemberships"), {
                federationId: federation.id,
                federationName: federation.name ?? "",
                participantId: profile.participantId ?? user.uid,
                connectorConnectionId: currentConnection.id,
                requesterId: user.uid,
                requesterEmail: user.email ?? "",
                requesterName: profile.name ?? user.displayName ?? user.email ?? user.uid,
                membershipType: federation.admissionMode ?? "approval",
                status,
                purpose: sanitizeMultilineText(membershipPurpose),
                termsAcknowledged: true,
                federationPolicyAccepted: true,
                federationPolicySnapshot: {
                    usageRules: federation.usageRules ?? "",
                    memberCriteria: federation.memberCriteria ?? "",
                    catalogVisibility: federation.catalogVisibility ?? "",
                    admissionMode: federation.admissionMode ?? "",
                },
                agreementId: "",
                inviteId: "",
                credentialId: "",
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                approvedAt: autoApprove ? serverTimestamp() : null,
                ownerId: federation.ownerId ?? "",
                ownerEmail: typeof federation.ownerEmail === "string" ? federation.ownerEmail : "",
                ownerName: typeof federation.ownerName === "string" ? federation.ownerName : "",
            })

            if (autoApprove) {
                await issueMembershipCredential({
                    id: membershipRef.id,
                    requesterId: user.uid,
                    requesterEmail: user.email ?? "",
                    requesterName: profile.name ?? user.displayName ?? user.email ?? user.uid,
                    participantId: profile.participantId ?? user.uid,
                    connectorConnectionId: currentConnection.id,
                    membershipType: federation.admissionMode ?? "approval",
                    status,
                    purpose: sanitizeMultilineText(membershipPurpose),
                })
            }

            setMembershipPurpose("")
            setMembershipTermsAccepted(false)
            setMembershipMessage(
                autoApprove
                    ? "Federation membership activated and membership credential issued. You can now move to asset agreements."
                    : "Membership request submitted. Wait for Data Owner approval.",
            )
            setMembershipsVersion((value) => value + 1)
        } catch (err) {
            console.error("Error creating federation membership:", err)
            setMembershipError("Could not create the membership request.")
        } finally {
            setMembershipSubmitting(false)
        }
    }

    const updateConnectionStatus = async (connectionId: string, status: "active" | "rejected" | "revoked") => {
        if (!canManageFederation) return

        try {
            setConnectionError("")
            setConnectionMessage("")
            await updateDoc(doc(db, "connectorConnections", connectionId), {
                status,
                updatedAt: serverTimestamp(),
                approvedAt: status === "active" ? serverTimestamp() : null,
                rejectedAt: status === "rejected" ? serverTimestamp() : null,
                revokedAt: status === "revoked" ? serverTimestamp() : null,
            })
            setConnectionMessage(
                status === "active"
                    ? "Connector connection approved. The consumer can now request federation membership."
                    : status === "rejected"
                        ? "Connector connection rejected."
                        : "Connector connection revoked.",
            )
            setMembershipsVersion((value) => value + 1)
        } catch (err) {
            console.error("Error updating connector connection:", err)
            setConnectionError("Could not update the connector connection.")
        }
    }

    const updateMembershipStatus = async (membership: FederationMembership, status: "active" | "rejected") => {
        if (!canManageFederation) return

        try {
            setMembershipError("")
            await updateDoc(doc(db, "federationMemberships", membership.id), {
                status,
                updatedAt: serverTimestamp(),
                approvedAt: status === "active" ? serverTimestamp() : null,
            })

            if (status === "active") {
                await issueMembershipCredential(membership)
            }

            setMembershipsVersion((value) => value + 1)
        } catch (err) {
            console.error("Error updating federation membership:", err)
            setMembershipError("Could not update the membership status.")
        }
    }

    const issueInvite = async () => {
        if (!canManageFederation || !federation) return

        const normalizedInviteEmail = inviteEmail.trim().toLowerCase()
        if (!normalizedInviteEmail) {
            setInviteError("Provide the invitee email before issuing an invitation.")
            return
        }

        try {
            setInviteSubmitting(true)
            setInviteError("")
            setInviteMessage("")

            await addDoc(collection(db, "federationInvites"), {
                federationId: federation.id,
                federationName: federation.name ?? "",
                inviteeEmail: normalizedInviteEmail,
                invitedById: user?.uid ?? "",
                status: "sent",
                signatureRequested: true,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                agreementId: "",
                ownerId: federation.ownerId ?? "",
                ownerEmail: typeof federation.ownerEmail === "string" ? federation.ownerEmail : "",
                ownerName: typeof federation.ownerName === "string" ? federation.ownerName : "",
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            })

            setInviteEmail("")
            setInviteMessage("Invitation issued and stored for auditable acceptance.")
            setMembershipsVersion((value) => value + 1)
        } catch (err) {
            console.error("Error issuing invitation:", err)
            setInviteError("Could not issue the invitation.")
        } finally {
            setInviteSubmitting(false)
        }
    }

    const acceptInvite = async () => {
        if (!user || !profile || !federation || !currentInvite) return

        try {
            setInviteSubmitting(true)
            setInviteError("")
            setInviteMessage("")

            if (!currentConnection || currentConnection.status !== "active") {
                setInviteError("Activate the connector connection before accepting the federation invitation.")
                return
            }

            await updateDoc(doc(db, "federationInvites", currentInvite.id), {
                status: "accepted",
                updatedAt: serverTimestamp(),
            })

            if (!currentMembership) {
                const membershipRef = await addDoc(collection(db, "federationMemberships"), {
                    federationId: federation.id,
                    federationName: federation.name ?? "",
                    participantId: profile.participantId ?? user.uid,
                    connectorConnectionId: currentConnection.id,
                    requesterId: user.uid,
                    requesterEmail: user.email ?? "",
                    requesterName: profile.name ?? user.displayName ?? user.email ?? user.uid,
                    membershipType: "invite-only",
                    status: "active",
                    purpose: "Accepted signed invitation.",
                    agreementId: "",
                    inviteId: currentInvite.id,
                    credentialId: "",
                    federationPolicyAccepted: true,
                    federationPolicySnapshot: {
                        usageRules: federation.usageRules ?? "",
                        memberCriteria: federation.memberCriteria ?? "",
                        catalogVisibility: federation.catalogVisibility ?? "",
                        admissionMode: federation.admissionMode ?? "",
                    },
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    approvedAt: serverTimestamp(),
                    ownerId: federation.ownerId ?? "",
                    ownerEmail: typeof federation.ownerEmail === "string" ? federation.ownerEmail : "",
                    ownerName: typeof federation.ownerName === "string" ? federation.ownerName : "",
                })

                await issueMembershipCredential({
                    id: membershipRef.id,
                    requesterId: user.uid,
                    requesterEmail: user.email ?? "",
                    requesterName: profile.name ?? user.displayName ?? user.email ?? user.uid,
                    participantId: profile.participantId ?? user.uid,
                    connectorConnectionId: currentConnection.id,
                    membershipType: "invite-only",
                    status: "active",
                    purpose: "Accepted signed invitation.",
                })
            }

            setInviteMessage("Invitation accepted. Federation membership is now active and a membership credential was issued.")
            setMembershipsVersion((value) => value + 1)
        } catch (err) {
            console.error("Error accepting invite:", err)
            setInviteError("Could not accept the invitation.")
        } finally {
            setInviteSubmitting(false)
        }
    }

    const cancelInvite = async (inviteId: string) => {
        if (!canManageFederation) return

        try {
            setInviteError("")
            await updateDoc(doc(db, "federationInvites", inviteId), {
                status: "cancelled",
                updatedAt: serverTimestamp(),
            })
            setMembershipsVersion((value) => value + 1)
        } catch (err) {
            console.error("Error cancelling invite:", err)
            setInviteError("Could not cancel the invitation.")
        }
    }

    if (loading) return <p className="p-8 text-gray-600">Loading...</p>
    if (error) return <p className="p-8 text-red-600">{error}</p>
    if (!federation) return <p className="p-8 text-gray-600">Federation not found</p>

    const hasActiveConnection = currentConnection?.status === "active"

    // Organização dos campos
    const federationFields = [
        { key: "name", label: "Federation Name" },
        { key: "description", label: "Description" },
        { key: "scope", label: "Scope" },
        { key: "notes", label: "Notes" },
    ]
    const domainFields = [
        { key: "federationType", label: "Federation Type" },
        { key: "catalogVisibility", label: "Catalog Visibility" },
        { key: "admissionMode", label: "Admission Mode" },
        { key: "governanceModel", label: "Governance Model" },
        { key: "memberCriteria", label: "Membership Criteria" },
        { key: "dataDomains", label: "Data Domains" },
        { key: "usageRules", label: "Usage Rules" },
        { key: "licenseType", label: "License Type" },
        { key: "dataLaw", label: "Data Law" },
        { key: "traceabilityAccepted", label: "Traceability Accepted" },
        { key: "ownershipAccepted", label: "Ownership Accepted" },
        { key: "termsAccepted", label: "Terms Accepted" },
    ]
    const orgFields = [
        { key: "organization", label: "Organization" },
    ]
    const contactFields = [
        { key: "contactEmail", label: "Contact Email" },
        { key: "website", label: "Website" },
    ]
    const metadataFields = [
        { key: "id", label: "Federation ID" },
        { key: "createdAt", label: "Created" },
        { key: "updatedAt", label: "Last Updated" },
    ]

    // Campos extras (se houver) que não estão nas listas acima
    const allKnownFields = [
        ...federationFields, ...domainFields, ...orgFields, ...contactFields, ...metadataFields
    ].map(f => f.key)
    const extraFields = Object.keys(federation)
        .filter(key => !allKnownFields.includes(key))

    // Função para renderizar campo
    const renderField = (field: { key: string, label: string }) => {
        if (federation[field.key] === undefined) return null
        const value = federation[field.key]
        if (isEditing) {
            if (typeof value === "boolean") {
                return (
                    <div key={field.key}>
                        <label className="block text-sm font-medium text-gray-700 mb-2">{field.label}</label>
                        <input
                            type="checkbox"
                            checked={!!editForm?.[field.key]}
                            onChange={e => handleInputChange(field.key, e.target.checked)}
                            className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                        />
                    </div>
                )
            }
            if (field.key === "description" || field.key === "notes" || field.key === "usageRules") {
                return (
                    <div key={field.key}>
                        <label className="block text-sm font-medium text-gray-700 mb-2">{field.label}</label>
                        <textarea
                            value={typeof editForm?.[field.key] === "string" || typeof editForm?.[field.key] === "number"
                                ? String(editForm?.[field.key])
                                : ""}
                            onChange={e => handleInputChange(field.key, e.target.value)}
                            rows={field.key === "description" ? 4 : 2}
                            className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-600 focus:border-blue-600"
                        />
                    </div>
                )
            }
            return (
                <div key={field.key}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{field.label}</label>
                    <input
                        type="text"
                        value={
                            typeof editForm?.[field.key] === "string" || typeof editForm?.[field.key] === "number"
                                ? String(editForm?.[field.key])
                                : (editForm?.[field.key] !== undefined && editForm?.[field.key] !== null
                                    ? String(editForm?.[field.key])
                                    : "")
                        }
                        onChange={e => handleInputChange(field.key, e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-600 focus:border-blue-600"
                    />
                </div>
            )
        }
        // Visualização
        return (
            <div key={field.key}>
                <label className="block text-sm font-medium text-gray-700 mb-2">{field.label}</label>
                <p className="text-gray-700">
                    {typeof value === "boolean"
                        ? value ? "Yes" : "No"
                        : value?.toString()}
                </p>
            </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto p-8">
            {/* Toast de confirmação de delete */}
            {showDeleteToast && (
                <Toast
                    message={`Are you sure you want to delete "${federation.name}"? This action cannot be undone.`}
                    actionLabel={isDeleting ? "Deleting..." : "Delete"}
                    onAction={confirmDelete}
                    onClose={() => setShowDeleteToast(false)}
                />
            )}

            {/* Header */}
            <div className="flex justify-between items-start mb-8">
                <div>
                    <Link href="/federations/browse" className="text-blue-600 hover:underline mb-4 inline-block">
                        ← Back to Federations
                    </Link>
                </div>
                <div className="flex gap-2">
                    {canManageFederation && !isEditing ? (
                        <>
                            <button
                                onClick={federation.publishedInCatalog ? unpublishFederationFromCatalog : publishFederationToCatalog}
                                className={`px-4 py-2 rounded-md text-white ${
                                    federation.publishedInCatalog
                                        ? "bg-slate-700 hover:bg-slate-800"
                                        : "bg-indigo-600 hover:bg-indigo-700"
                                }`}
                            >
                                {federation.publishedInCatalog ? "Unpublish Catalog" : "Publish Catalog"}
                            </button>
                            <button onClick={handleEdit} className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700">
                                Edit
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 disabled:opacity-50"
                            >
                                {isDeleting ? "Deleting..." : "Delete"}
                            </button>
                        </>
                    ) : canManageFederation ? (
                        <>
                            <button onClick={handleSave} className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700">
                                Save
                            </button>
                            <button onClick={handleCancel} className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700">
                                Cancel
                            </button>
                        </>
                    ) : (
                        <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-600">
                            Read-only view. Only the owning Data Owner can edit this federation.
                        </div>
                    )}
                </div>
            </div>

            {/* Dados da Federação */}
            <div className="bg-white rounded-lg shadow-sm border p-6 mb-8">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Federation Data</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {federationFields.map(renderField)}
                </div>
            </div>

            {/* Domínio da Federação */}
            <div className="bg-white rounded-lg shadow-sm border p-6 mb-8">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Domain & Rules</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {domainFields.map(renderField)}
                </div>
            </div>

            {!isEditing && (
                <div className="mb-8">
                    <h2 className="text-2xl font-bold text-gray-800 mb-6">Federation Membership</h2>
                    <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
                        <section className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
                            <div className="mb-8">
                                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700">
                                    <Users className="h-4 w-4 shrink-0" />
                                    Federation membership
                                </div>
                                <h3 className="text-3xl font-bold text-gray-900">Join this federation</h3>
                                <p className="mt-3 max-w-2xl text-gray-600">
                                    Mirrors the controlled access flow used for assets: your request is stored with requester
                                    identity and audit metadata. Admission mode:{" "}
                                    <strong>{federation.admissionMode ?? "approval"}</strong>. Join before negotiating asset
                                    contracts.
                                </p>
                            </div>

                            {membershipMessage ? (
                                <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                                    {membershipMessage}
                                </div>
                            ) : null}

                            {membershipError ? (
                                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                                    {membershipError}
                                </div>
                            ) : null}

                            {membershipLoading ? (
                                <p className="text-sm text-gray-500">Loading membership status...</p>
                            ) : canRequestMembership ? (
                                <div className="space-y-4">
                                    {connectionMessage ? (
                                        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                                            {connectionMessage}
                                        </div>
                                    ) : null}

                                    {connectionError ? (
                                        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                                            {connectionError}
                                        </div>
                                    ) : null}

                                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                                        <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-700">
                                            <Plug className="h-4 w-4" />
                                            Connector-to-connector connection
                                        </div>
                                        <p>
                                            <span className="font-medium">Status:</span> {currentConnection?.status ?? "not requested"}
                                        </p>
                                        <p className="mt-1">
                                            <span className="font-medium">Provider participant:</span>{" "}
                                            {ownerConnector?.participantId || "not informed"}
                                        </p>
                                        <p className="mt-1">
                                            <span className="font-medium">Consumer participant:</span>{" "}
                                            {profile?.participantId ?? "configure your connector first"}
                                        </p>
                                    </div>

                                    {!hasConsumerConnectorProfile ? (
                                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                            Configure your consumer connector before requesting access to this provider connector.
                                            <Link href="/profile/connector" className="ml-1 font-medium underline">
                                                Open connector profile
                                            </Link>
                                        </div>
                                    ) : !currentConnection ? (
                                        <div className="flex flex-wrap gap-3">
                                            <button
                                                type="button"
                                                onClick={requestConnectorConnection}
                                                disabled={connectionSubmitting}
                                                className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                                            >
                                                {connectionSubmitting ? "Submitting..." : "Request connector connection"}
                                            </button>
                                        </div>
                                    ) : currentConnection.status === "requested" ? (
                                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                            Connector connection pending owner approval. Membership and asset negotiation stay blocked until approval.
                                        </div>
                                    ) : currentConnection.status === "rejected" || currentConnection.status === "revoked" ? (
                                        <div className="flex flex-wrap gap-3">
                                            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                                                The connector connection is {currentConnection.status}. Submit a new request to restart the process.
                                            </div>
                                            <button
                                                type="button"
                                                onClick={requestConnectorConnection}
                                                disabled={connectionSubmitting}
                                                className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                                            >
                                                {connectionSubmitting ? "Submitting..." : "Request new connection"}
                                            </button>
                                        </div>
                                    ) : currentMembership ? (
                                        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
                                            <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-800">
                                                <KeyRound className="h-4 w-4" />
                                                Current membership
                                            </div>
                                            <p className="font-semibold text-base">Status: {currentMembership.status}</p>
                                            <p className="mt-1">Mode: {currentMembership.membershipType ?? "not informed"}</p>
                                            <p className="mt-1">Connector connection: active</p>
                                            {currentMembership.purpose ? (
                                                <p className="mt-3 whitespace-pre-line border-t border-blue-200/60 pt-3">
                                                    <span className="font-medium">Purpose submitted:</span> {currentMembership.purpose}
                                                </p>
                                            ) : null}
                                        </div>
                                    ) : (federation.admissionMode ?? "") === "invite-only" ? (
                                        currentInvite && (currentInvite.status === "sent" || currentInvite.status === "issued") ? (
                                            <div className="space-y-4">
                                                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
                                                    <p className="font-semibold">Invitation for {currentInvite.inviteeEmail}</p>
                                                    <p className="mt-1">
                                                        Status: {currentInvite.status}
                                                        {currentInvite.expiresAt?.toDate
                                                            ? ` · Expires: ${currentInvite.expiresAt.toDate().toLocaleDateString()}`
                                                            : ""}
                                                    </p>
                                                </div>
                                                {inviteMessage ? (
                                                    <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                                                        {inviteMessage}
                                                    </div>
                                                ) : null}
                                                {inviteError ? (
                                                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                                                        {inviteError}
                                                    </div>
                                                ) : null}
                                                <button
                                                    type="button"
                                                    onClick={acceptInvite}
                                                    disabled={inviteSubmitting}
                                                    className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                                                >
                                                    {inviteSubmitting ? "Accepting..." : "Accept signed invite"}
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                                This federation uses signed invitations only. Ask the Data Owner to issue an invite.
                                            </div>
                                        )
                                    ) : (
                                        <div className="grid gap-6">
                                            <div>
                                                <label className="mb-2 block text-sm font-medium text-gray-700">
                                                    Purpose for joining
                                                </label>
                                                <textarea
                                                    value={membershipPurpose}
                                                    onChange={(event) => setMembershipPurpose(event.target.value)}
                                                    rows={4}
                                                    placeholder="Describe why you need access to this federation and what assets you expect to consume."
                                                    className="w-full rounded-lg border border-gray-300 px-4 py-3 shadow-sm focus:border-blue-600 focus:outline-none"
                                                />
                                            </div>
                                            <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                                                <input
                                                    type="checkbox"
                                                    checked={membershipTermsAccepted}
                                                    onChange={(event) => setMembershipTermsAccepted(event.target.checked)}
                                                    className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600"
                                                />
                                                <span>
                                                    I sign and accept the federation policy context, governance, traceability,
                                                    and declared purpose for this membership request.
                                                </span>
                                            </label>
                                            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
                                                <p className="font-medium">Federation policy snapshot</p>
                                                <p className="mt-1">Admission mode: {federation.admissionMode ?? "approval"}</p>
                                                <p className="mt-1">Catalog visibility: {federation.catalogVisibility ?? "members"}</p>
                                                <p className="mt-1 whitespace-pre-line">
                                                    Usage rules: {typeof federation.usageRules === "string" ? federation.usageRules : "Not informed"}
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap gap-3">
                                                <button
                                                    type="button"
                                                    onClick={requestMembership}
                                                    disabled={membershipSubmitting || !hasActiveConnection}
                                                    className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    {membershipSubmitting
                                                        ? "Submitting..."
                                                        : (federation.admissionMode ?? "") === "self-service"
                                                          ? "Join federation"
                                                          : "Submit membership request"}
                                                </button>
                                                <Link
                                                    href="/access"
                                                    className="rounded-lg border border-blue-600 px-6 py-3 font-semibold text-blue-600 transition hover:bg-blue-50"
                                                >
                                                    Open access workspace
                                                </Link>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-sm text-gray-700">
                                    <p className="font-medium text-gray-900">Data Client only</p>
                                    <p className="mt-2">
                                        Membership self-service is available to accounts with the Data Client role. Data Owners
                                        manage incoming requests in the owner panel.
                                    </p>
                                </div>
                            )}
                        </section>

                        <section className="space-y-6">
                            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Owner queue</h3>
                            <p className="text-sm text-gray-500 mb-4">
                                Same role as reviewing asset access: approve or reject membership before consumers negotiate
                                contracts.
                            </p>
                            {canManageFederation ? (
                                <div className="space-y-6">
                                    {connectionMessage ? (
                                        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                                            {connectionMessage}
                                        </div>
                                    ) : null}
                                    {connectionError ? (
                                        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                                            {connectionError}
                                        </div>
                                    ) : null}
                                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                                        <h4 className="font-medium text-gray-900 mb-3">Issue invitation</h4>
                                        {inviteMessage ? (
                                            <div className="mb-3 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                                                {inviteMessage}
                                            </div>
                                        ) : null}
                                        {inviteError ? (
                                            <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                                                {inviteError}
                                            </div>
                                        ) : null}
                                        <div className="flex flex-col gap-3">
                                            <input
                                                type="email"
                                                value={inviteEmail}
                                                onChange={(event) => setInviteEmail(event.target.value)}
                                                placeholder="invitee@company.com"
                                                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                                            />
                                            <button
                                                type="button"
                                                onClick={issueInvite}
                                                disabled={inviteSubmitting}
                                                className="self-start rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                                            >
                                                {inviteSubmitting ? "Issuing..." : "Issue invite"}
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <h4 className="font-medium text-gray-900 mb-3">Connector connections</h4>
                                        {connectorConnections.length === 0 ? (
                                            <p className="text-sm text-gray-500">No connector connection requests for this provider yet.</p>
                                        ) : (
                                            <ul className="space-y-3">
                                                {connectorConnections.map((connection) => (
                                                    <li key={connection.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                                                        <p className="font-medium text-gray-900">
                                                            {connection.requesterName ?? connection.requesterEmail ?? connection.requesterId}
                                                        </p>
                                                        <p className="mt-1 text-xs text-gray-500">
                                                            Status: {connection.status}
                                                            {connection.consumerParticipantId ? ` · Consumer participant: ${connection.consumerParticipantId}` : ""}
                                                        </p>
                                                        <p className="mt-2 text-sm text-gray-700">
                                                            Consumer DSP: {connection.consumerConnectorDspBaseUrl || "not informed"}
                                                        </p>
                                                        {connection.status === "requested" ? (
                                                            <div className="mt-3 flex gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => updateConnectionStatus(connection.id, "active")}
                                                                    className="rounded-md bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700"
                                                                >
                                                                    Approve connection
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => updateConnectionStatus(connection.id, "rejected")}
                                                                    className="rounded-md bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700"
                                                                >
                                                                    Reject
                                                                </button>
                                                            </div>
                                                        ) : connection.status === "active" ? (
                                                            <div className="mt-3 flex gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => updateConnectionStatus(connection.id, "revoked")}
                                                                    className="rounded-md bg-gray-700 px-3 py-2 text-xs font-medium text-white hover:bg-gray-800"
                                                                >
                                                                    Revoke connection
                                                                </button>
                                                            </div>
                                                        ) : null}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>

                                    <div>
                                        <h4 className="font-medium text-gray-900 mb-3">Membership requests</h4>
                                        {federationMemberships.length === 0 ? (
                                            <p className="text-sm text-gray-500">No membership records for this federation yet.</p>
                                        ) : (
                                            <ul className="space-y-3">
                                                {federationMemberships.map((membership) => (
                                                    <li key={membership.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                                                        <p className="font-medium text-gray-900">{membership.requesterName ?? membership.requesterEmail ?? membership.requesterId}</p>
                                                        <p className="mt-1 text-xs text-gray-500">
                                                            Status: {membership.status}
                                                            {membership.membershipType ? ` · Mode: ${membership.membershipType}` : ""}
                                                        </p>
                                                        {membership.purpose ? (
                                                            <p className="mt-2 text-sm text-gray-700 whitespace-pre-line">{membership.purpose}</p>
                                                        ) : null}
                                                        {(membership.status === "requested" || membership.status === "pending-approval") ? (
                                                            <div className="mt-3 flex gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => updateMembershipStatus(membership, "active")}
                                                                    className="rounded-md bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700"
                                                                >
                                                                    Approve
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => updateMembershipStatus(membership, "rejected")}
                                                                    className="rounded-md bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700"
                                                                >
                                                                    Reject
                                                                </button>
                                                            </div>
                                                        ) : null}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>

                                    <div>
                                        <h4 className="font-medium text-gray-900 mb-3">Invitations</h4>
                                        {federationInvites.length === 0 ? (
                                            <p className="text-sm text-gray-500">No invitations issued yet.</p>
                                        ) : (
                                            <ul className="space-y-3">
                                                {federationInvites.map((invite) => (
                                                    <li key={invite.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                                                        <p className="font-medium text-gray-900">{invite.inviteeEmail}</p>
                                                        <p className="mt-1 text-xs text-gray-500">
                                                            Status: {invite.status}
                                                            {invite.expiresAt?.toDate ? ` · Expires: ${invite.expiresAt.toDate().toLocaleDateString()}` : ""}
                                                        </p>
                                                        {invite.status === "sent" || invite.status === "issued" ? (
                                                            <div className="mt-3 flex gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => cancelInvite(invite.id)}
                                                                    className="rounded-md bg-gray-700 px-3 py-2 text-xs font-medium text-white hover:bg-gray-800"
                                                                >
                                                                    Cancel invite
                                                                </button>
                                                            </div>
                                                        ) : null}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500">
                                    Only the owning Data Owner can review membership requests.
                                </p>
                            )}
                            </div>
                        </section>
                    </div>
                </div>
            )}

            {/* Dados da Organização */}
            <div className="bg-white rounded-lg shadow-sm border p-6 mb-8">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Organization</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {orgFields.map(renderField)}
                </div>
            </div>

            {/* Contatos */}
            <div className="bg-white rounded-lg shadow-sm border p-6 mb-8">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Contacts</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {contactFields.map(renderField)}
                </div>
            </div>

            {/* Metadata */}
               <div className="bg-gray-50 rounded-lg border p-6 mb-8">
                <h3 className="text-lg font-medium text-gray-800 mb-4">Metadata</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                    {metadataFields.map(field => {
                        if (federation[field.key] === undefined) return null
                        let value = federation[field.key]
                        if (field.key === "createdAt" || field.key === "updatedAt") {
                            // Corrigido para evitar uso de 'any'
                            if (
                                value &&
                                typeof value === "object" &&
                                "toDate" in value &&
                                typeof (value as { toDate?: () => Date }).toDate === "function"
                            ) {
                                value = (value as { toDate: () => Date }).toDate().toLocaleString()
                            } else if (typeof value === "string" || typeof value === "number" || value instanceof Date) {
                                value = new Date(value).toLocaleString()
                            } else {
                                value = ""
                            }
                        }
                        return (
                            <div key={field.key}>
                                <strong>{field.label}:</strong> {value !== undefined && value !== null ? String(value) : ""}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Campos extras */}
            {extraFields.length > 0 && (
                <div className="bg-blue-50 rounded-lg border p-6 mb-8">
                    <h3 className="text-lg font-medium text-blue-800 mb-4">Other Federation Data</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-900">
                        {extraFields.map((field) => (
                            <div key={field}>
                                <strong>{field.replace(/([A-Z])/g, " $1").replace(/^./, str => str.toUpperCase())}:</strong>{" "}
                                {typeof federation[field] === "boolean"
                                    ? federation[field] ? "Yes" : "No"
                                    : federation[field]?.toString()}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Owner-only: register assets and compliance for this federation */}
            {!isEditing && canManageFederation && (
                <div>
                    <div className="flex flex-col md:flex-row gap-4 w-full mt-4">
                        <Link
                            href={`/assets/create?federationId=${federation.id}&federationName=${encodeURIComponent(federation.name ?? "")}`}
                            className="inline-block bg-blue-600 text-white border border-blue-600 hover:bg-white hover:text-blue-600 font-semibold px-6 py-3 rounded-md shadow-sm transition-colors w-full text-center"
                        >
                            Add Assets To This Federation
                        </Link>
                        <Link
                            href={`/accordance/compliance/create?federationId=${federation.id}&federationName=${encodeURIComponent(federation.name ?? "")}`}
                            className="inline-block bg-white text-blue-600 border border-blue-600 hover:bg-blue-600 hover:text-white font-semibold px-6 py-3 rounded-md shadow-sm transition-colors w-full text-center"
                        >
                            Add Compliance Rules To This Federation
                        </Link>
                    </div>
                </div>
            )}
            {!isEditing && !canManageFederation && user && (
                <p className="mt-4 text-sm text-gray-500">
                    Only the Data Owner who owns this federation can add assets or compliance records.
                </p>
            )}
        </div>
    )
}
