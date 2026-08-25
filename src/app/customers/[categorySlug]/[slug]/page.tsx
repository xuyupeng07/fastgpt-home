import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  generateSolutionMetadata,
  renderSolutionPage,
  type SolutionRouteParams
} from '@customers/lib/solution-page';
import { getAllPublishedSolutionDetails, getSolutionByIdPublic } from '@customers/lib/data';

type SemanticSolutionPageProps = { params: Promise<{ categorySlug: string; slug: string }> };

export function generateStaticParams() {
  return getAllPublishedSolutionDetails().map((solution) => ({
    categorySlug: solution.categorySlug,
    slug: solution.slug
  }));
}

export async function generateMetadata({ params }: SemanticSolutionPageProps): Promise<Metadata> {
  const { slug } = await params;
  return generateSolutionMetadata({ id: slug });
}

export default async function SemanticSolutionPage({ params }: SemanticSolutionPageProps) {
  const { slug } = await params;
  const routeParams: SolutionRouteParams = { id: slug };
  const solution = getSolutionByIdPublic(slug);

  if (!solution) notFound();

  return renderSolutionPage(routeParams);
}
